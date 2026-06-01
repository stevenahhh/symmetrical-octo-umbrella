import asyncio
import base64
import json
import cv2
import numpy as np
from collections import defaultdict, deque
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

# Import functions from parking_counter
from parking_counter import (
    load_gates, apply_roi_mask, draw_roi, draw_gate, 
    point_in_roi, crossed_gate, VEHICLE_CLASSES
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load YOLO model
model = YOLO("yolov8s.pt")

# Global states (Supports single active session well)
current_cars = 0
entered_cars = 0
exited_cars = 0
prev_points = {}
trajectories = defaultdict(lambda: deque(maxlen=25))
last_count_frame = {}
frame_idx = 0

gates = None
roi = None
min_move = 0

def reset_state():
    global current_cars, entered_cars, exited_cars, prev_points, trajectories, last_count_frame, frame_idx, gates, roi, min_move
    current_cars = 0
    entered_cars = 0
    exited_cars = 0
    prev_points = {}
    trajectories = defaultdict(lambda: deque(maxlen=25))
    last_count_frame = {}
    frame_idx = 0
    gates = None
    roi = None
    min_move = 0

@app.get("/api/stats")
async def get_stats():
    """다른 시스템에서 실시간 차량 입출차 데이터를 가져갈 수 있는 API"""
    global current_cars, entered_cars, exited_cars
    return {
        "entered": entered_cars,
        "exited": exited_cars,
        "current": current_cars
    }

@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    reset_state()
    global frame_idx, gates, roi, min_move, current_cars, entered_cars, exited_cars
    
    print("Client connected")
    try:
        while True:
            data = await websocket.receive_text()
            
            # The data might be prefixed with "data:image/jpeg;base64,"
            if "," in data:
                header, base64_data = data.split(",", 1)
            else:
                base64_data = data
                
            img_data = base64.b64decode(base64_data)
            np_arr = np.frombuffer(img_data, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            if frame is None:
                continue

            height, width = frame.shape[:2]
            
            # Initialize gates based on resolution of first frame
            if gates is None:
                gates, roi = load_gates(None, width, height) # Using default relative positions
                min_move = min(width, height) * 0.003
                print(f"Gates initialized for resolution {width}x{height}")

            frame_idx += 1
            track_frame = apply_roi_mask(frame, roi)

            # YOLO Tracking
            results = model.track(
                track_frame,
                classes=VEHICLE_CLASSES,
                conf=0.45,
                iou=0.45,
                persist=True,
                tracker="bytetrack.yaml",
                verbose=False
            )

            draw_roi(frame, roi)
            for gate in gates:
                draw_gate(frame, gate)

            if results[0].boxes.id is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy()
                track_ids = results[0].boxes.id.cpu().numpy().astype(int)
                confs = results[0].boxes.conf.cpu().numpy()

                for box, track_id, conf in zip(boxes, track_ids, confs):
                    x1, y1, x2, y2 = map(int, box)
                    center_x = int((x1 + x2) / 2)
                    center_y = int(y2)
                    curr_pt = (center_x, center_y)

                    if not point_in_roi(curr_pt, roi):
                        continue

                    prev_pt = prev_points.get(track_id)
                    trajectories[track_id].append(curr_pt)

                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.circle(frame, curr_pt, 5, (0, 255, 255), -1)
                    cv2.putText(
                        frame,
                        f"ID:{track_id}",
                        (x1, max(20, y1 - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.55,
                        (0, 255, 0),
                        2
                    )

                    pts = list(trajectories[track_id])
                    for i in range(1, len(pts)):
                        cv2.line(frame, pts[i - 1], pts[i], (0, 255, 255), 2)

                    if prev_pt is not None:
                        for gate in gates:
                            key = (track_id, gate.name)
                            last_frame = last_count_frame.get(key, -999999)

                            if frame_idx - last_frame < gate.cooldown_frames:
                                continue

                            if crossed_gate(trajectories[track_id], gate, min_move):
                                if gate.event_type == "입차":
                                    entered_cars += 1
                                    current_cars += 1
                                elif gate.event_type == "출차":
                                    exited_cars += 1
                                    current_cars = max(0, current_cars - 1)

                                last_count_frame[key] = frame_idx
                                cv2.line(frame, gate.p1, gate.p2, (0, 255, 0), 7)

                    prev_points[track_id] = curr_pt

            # Encode processed frame back to base64
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
            result_base64 = base64.b64encode(buffer).decode('utf-8')
            
            response_data = {
                "image": f"data:image/jpeg;base64,{result_base64}",
                "entered": entered_cars,
                "exited": exited_cars,
                "current": current_cars
            }
            
            await websocket.send_json(response_data)
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
