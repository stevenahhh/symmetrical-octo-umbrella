import cv2
import argparse
import threading
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import uvicorn
import asyncio

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state for API
traffic_stats = {
    "entered": 0,
    "exited": 0,
    "current_cars": 0,
    "total_spaces": 50,
    "is_running": False
}

def run_vision_model(source, line_ratio, direction, conf, spaces):
    global traffic_stats
    
    print(f"Loading YOLO model... source={source}")
    model = YOLO('car_vision_model/yolov8s.pt')
    
    if source.isdigit():
        source = int(source)
        
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"Error opening video source: {source}")
        return

    video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    if video_height == 0:
        video_height = 480
    COUNTING_LINE_Y = int(video_height * line_ratio)

    track_history = {}
    traffic_stats["total_spaces"] = spaces
    traffic_stats["is_running"] = True
    print("Vision model processing started in background.")

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            continue

        results = model.track(
            frame, 
            classes=[2, 3, 5, 7], 
            conf=conf, 
            iou=0.4,                  
            persist=True, 
            tracker="bytetrack.yaml", 
            verbose=False
        )

        if results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            track_ids = results[0].boxes.id.cpu().numpy()

            for box, track_id in zip(boxes, track_ids):
                x1, y1, x2, y2 = map(int, box)
                center_y = int((y1 + y2) / 2)

                if track_id in track_history:
                    prev_y = track_history[track_id]
                    is_entered = False
                    is_exited = False

                    if direction == 'up_to_down':
                        if prev_y < COUNTING_LINE_Y and center_y >= COUNTING_LINE_Y:
                            is_entered = True
                        elif prev_y > COUNTING_LINE_Y and center_y <= COUNTING_LINE_Y:
                            is_exited = True
                    elif direction == 'down_to_up':
                        if prev_y > COUNTING_LINE_Y and center_y <= COUNTING_LINE_Y:
                            is_entered = True
                        elif prev_y < COUNTING_LINE_Y and center_y >= COUNTING_LINE_Y:
                            is_exited = True

                    if is_entered:
                        traffic_stats["entered"] += 1
                        traffic_stats["current_cars"] += 1
                        print(f"Car Entered! ID: {track_id}, Total IN: {traffic_stats['entered']}")
                    elif is_exited:
                        traffic_stats["exited"] += 1
                        traffic_stats["current_cars"] = max(0, traffic_stats["current_cars"] - 1)
                        print(f"Car Exited! ID: {track_id}, Total OUT: {traffic_stats['exited']}")

                track_history[track_id] = center_y

@app.get("/api/traffic")
def get_traffic_stats():
    return traffic_stats

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=str, default='0', help='Camera index (e.g. 0) or stream URL')
    parser.add_argument('--line', type=float, default=0.5)
    parser.add_argument('--direction', type=str, default='up_to_down')
    parser.add_argument('--conf', type=float, default=0.4)
    parser.add_argument('--spaces', type=int, default=50)
    parser.add_argument('--port', type=int, default=8001)
    args = parser.parse_args()

    t = threading.Thread(target=run_vision_model, args=(args.source, args.line, args.direction, args.conf, args.spaces))
    t.daemon = True
    t.start()

    print(f"Starting API server on port {args.port}...")
    uvicorn.run(app, host="0.0.0.0", port=args.port)
