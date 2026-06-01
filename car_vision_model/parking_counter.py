import cv2
import csv
import os
import json
import argparse
import numpy as np
from dataclasses import dataclass
from datetime import datetime
from collections import defaultdict, deque
from ultralytics import YOLO


# =========================
# 기본 설정
# =========================

VEHICLE_CLASSES = [2, 3, 5, 7]
# COCO 기준:
# 2 car, 3 motorcycle, 5 bus, 7 truck


@dataclass
class Gate:
    name: str
    event_type: str          # "입차" or "출차"
    p1: tuple                # counting line point 1, pixel
    p2: tuple                # counting line point 2, pixel
    direction: tuple         # allowed movement direction vector
    color: tuple             # BGR
    cooldown_frames: int = 45


def log_event(csv_filename, event_type, track_id, current_in, available):
    with open(csv_filename, mode="a", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        avail_str = available if available is not None else "N/A"
        writer.writerow([now, event_type, track_id, current_in, avail_str])
        print(f"[{now}] {event_type} - 차량 ID: {track_id} | 현재: {current_in} | 잔여: {avail_str}")


def normalize(v):
    v = np.array(v, dtype=np.float32)
    norm = np.linalg.norm(v)
    if norm < 1e-6:
        return v
    return v / norm


def cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def segment_intersection(a, b, c, d):
    """
    선분 AB와 선분 CD가 교차하는지 판단
    """
    a = np.array(a, dtype=np.float32)
    b = np.array(b, dtype=np.float32)
    c = np.array(c, dtype=np.float32)
    d = np.array(d, dtype=np.float32)

    ab = b - a
    cd = d - c

    denom = cross(ab, cd)

    if abs(denom) < 1e-6:
        return False

    t = cross(c - a, cd) / denom
    u = cross(c - a, ab) / denom

    return 0 <= t <= 1 and 0 <= u <= 1


def crossed_gate(traj_pts, gate: Gate, min_move: float, min_dot: float = 0.35):
    """
    trajectories 덱의 최근 최대 5점을 이동 평균으로 평활화한 벡터로
    gate 교차 여부와 이동 방향을 판단한다.

    - smooth_prev: 최근 5점 중 앞쪽 절반의 평균 (과거 위치)
    - smooth_curr: 최근 5점 중 뒤쪽 절반의 평균 (현재 위치)
    - min_move: 해상도 비례 최소 이동량 (min(W,H)*0.003)
    """
    pts = list(traj_pts)[-5:]
    if len(pts) < 2:
        return False

    half = max(1, len(pts) // 2)
    smooth_prev = np.mean(pts[:half], axis=0).astype(np.float32)
    smooth_curr = np.mean(pts[half:], axis=0).astype(np.float32)

    move_vec = smooth_curr - smooth_prev
    if np.linalg.norm(move_vec) < min_move:
        return False

    move_dir = normalize(move_vec)
    target_dir = normalize(gate.direction)

    if float(np.dot(move_dir, target_dir)) < min_dot:
        return False

    return segment_intersection(
        tuple(smooth_prev), tuple(smooth_curr),
        gate.p1, gate.p2,
    )


def ratio_to_pixel(point, width, height):
    """
    config에서 0~1 비율로 저장한 좌표를 실제 영상 픽셀 좌표로 변환
    """
    x, y = point
    return int(x * width), int(y * height)


def load_gates(config_path, width, height):
    """
    config 파일이 있으면 config 기반으로 Gate 생성
    없으면 사진 구조 기준 기본값 사용
    """

    if config_path and os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)

        gates = []
        for g in cfg["gates"]:
            p1 = ratio_to_pixel(g["p1"], width, height)
            p2 = ratio_to_pixel(g["p2"], width, height)
            direction = tuple(g["direction"])
            color = tuple(g.get("color", [0, 255, 255]))

            gates.append(
                Gate(
                    name=g["name"],
                    event_type=g["event_type"],
                    p1=p1,
                    p2=p2,
                    direction=direction,
                    color=color,
                    cooldown_frames=g.get("cooldown_frames", 45),
                )
            )

        roi = None
        if "roi" in cfg:
            roi = np.array(
                [ratio_to_pixel(p, width, height) for p in cfg["roi"]],
                dtype=np.int32
            )

        return gates, roi

    # =========================
    # 사진 기준 기본값
    # =========================
    # 아래 좌표는 사용자가 올린 사진과 유사한 구도 기준이다.
    # 실제 CCTV/영상에서는 반드시 조금씩 조정하는 것을 권장.
    #
    # 입차: 붉은색 방향, 대략 오른쪽 -> 왼쪽
    # 출차: 파란색 방향, 대략 아래/오른쪽 -> 위/오른쪽
    #
    # 좌표는 비율값이므로 영상 해상도가 달라도 어느 정도 대응된다.

    enter_gate = Gate(
        name="ENTER_GATE",
        event_type="입차",
        p1=ratio_to_pixel((0.28, 0.39), width, height),
        p2=ratio_to_pixel((0.28, 0.56), width, height),
        direction=(-1.0, 0.0),
        color=(0, 0, 255),  # red
        cooldown_frames=45,
    )

    exit_gate = Gate(
        name="EXIT_GATE",
        event_type="출차",
        p1=ratio_to_pixel((0.60, 0.42), width, height),
        p2=ratio_to_pixel((0.53, 0.60), width, height),
        direction=(0.45, -0.90),
        color=(255, 0, 0),  # blue
        cooldown_frames=45,
    )

    # 도로 영역만 대략적으로 ROI 지정
    roi = np.array([
        ratio_to_pixel((0.02, 0.38), width, height),
        ratio_to_pixel((0.65, 0.34), width, height),
        ratio_to_pixel((0.73, 0.39), width, height),
        ratio_to_pixel((0.98, 0.60), width, height),
        ratio_to_pixel((0.98, 0.72), width, height),
        ratio_to_pixel((0.55, 0.62), width, height),
        ratio_to_pixel((0.25, 0.55), width, height),
        ratio_to_pixel((0.02, 0.55), width, height),
    ], dtype=np.int32)

    return [enter_gate, exit_gate], roi


def point_in_roi(point, roi):
    if roi is None:
        return True

    x, y = point
    result = cv2.pointPolygonTest(roi, (float(x), float(y)), False)
    return result >= 0


def apply_roi_mask(frame, roi):
    """ROI 외부를 검은색으로 마스킹한 복사본 반환. roi가 None이면 원본 반환."""
    if roi is None:
        return frame
    mask = np.zeros(frame.shape[:2], dtype=np.uint8)
    cv2.fillPoly(mask, [roi], 255)
    masked = frame.copy()
    masked[mask == 0] = 0
    return masked


def draw_gate(frame, gate: Gate):
    p1 = tuple(map(int, gate.p1))
    p2 = tuple(map(int, gate.p2))

    cv2.line(frame, p1, p2, gate.color, 3)

    cx = int((p1[0] + p2[0]) / 2)
    cy = int((p1[1] + p2[1]) / 2)

    d = normalize(gate.direction)
    arrow_len = 70

    start = (cx, cy)
    end = (
        int(cx + d[0] * arrow_len),
        int(cy + d[1] * arrow_len)
    )

    cv2.arrowedLine(frame, start, end, gate.color, 4, tipLength=0.35)
    cv2.putText(
        frame,
        f"{gate.event_type}",
        (cx + 10, cy - 10),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        gate.color,
        2
    )


def draw_roi(frame, roi):
    if roi is not None:
        overlay = frame.copy()
        cv2.polylines(overlay, [roi], True, (0, 255, 255), 2)
        cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)


def create_csv(source):
    source_name = os.path.splitext(os.path.basename(source))[0]
    time_str = datetime.now().strftime("%m_%d_%H%M")
    csv_filename = f"{time_str}_{source_name}_directional.csv"

    file_exists = os.path.isfile(csv_filename)

    with open(csv_filename, mode="a", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["시간", "이벤트", "차량ID", "현재_주차대수", "잔여_주차공간"])

    return csv_filename


def main():
    parser = argparse.ArgumentParser(description="방향성 Gate 기반 주차장 입출차 카운터")
    parser.add_argument("--source", type=str, required=True, help="비디오 파일 경로 또는 카메라 번호")
    parser.add_argument("--model", type=str, default="yolov8s.pt", help="YOLO 모델 경로")
    parser.add_argument("--conf", type=float, default=0.45, help="객체 인식 신뢰도")
    parser.add_argument("--iou", type=float, default=0.45, help="YOLO tracking IoU")
    parser.add_argument("--spaces", type=int, default=50, help="전체 주차 공간 수. 0이면 잔여 공간 계산 안 함")
    parser.add_argument("--start-cars", type=int, default=0, help="시작 시점 주차장 내부 차량 수")
    parser.add_argument("--config", type=str, default=None, help="Gate/ROI 설정 JSON 파일")
    parser.add_argument("--save-video", action="store_true", help="결과 영상 저장 여부")
    parser.add_argument("--show", action="store_true", help="실시간 화면 표시 여부")
    args = parser.parse_args()

    source = int(args.source) if args.source.isdigit() else args.source

    model = YOLO(args.model)
    cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        print(f"에러: 소스({args.source})를 열 수 없습니다.")
        return

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)

    if fps <= 0:
        fps = 30

    min_move = min(width, height) * 0.003

    gates, roi = load_gates(args.config, width, height)
    csv_filename = create_csv(args.source)

    writer = None
    if args.save_video:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out_name = os.path.splitext(csv_filename)[0] + ".mp4"
        writer = cv2.VideoWriter(out_name, fourcc, fps, (width, height))
        print(f"결과 영상 저장: {out_name}")

    current_cars = max(0, args.start_cars)
    entered_cars = 0
    exited_cars = 0

    prev_points = {}
    trajectories = defaultdict(lambda: deque(maxlen=25))
    last_count_frame = {}

    frame_idx = 0

    print("----- 테스트 시작 -----")
    print(f"source: {args.source}")
    print(f"csv: {csv_filename}")
    print(f"resolution: {width}x{height}")
    print(f"start cars: {current_cars}")

    while True:
        success, frame = cap.read()
        if not success:
            break

        frame_idx += 1

        track_frame = apply_roi_mask(frame, roi)

        results = model.track(
            track_frame,
            classes=VEHICLE_CLASSES,
            conf=args.conf,
            iou=args.iou,
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

                # 차량 위치는 중심점보다 bottom-center가 도로 위 실제 위치에 가까움
                center_x = int((x1 + x2) / 2)
                center_y = int(y2)
                curr_pt = (center_x, center_y)

                if not point_in_roi(curr_pt, roi):
                    continue

                prev_pt = prev_points.get(track_id)

                trajectories[track_id].append(curr_pt)

                # 바운딩박스 및 ID 표시
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.circle(frame, curr_pt, 5, (0, 255, 255), -1)
                cv2.putText(
                    frame,
                    f"ID:{track_id} {conf:.2f}",
                    (x1, max(20, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (0, 255, 0),
                    2
                )

                # 이동 궤적 표시
                pts = list(trajectories[track_id])
                for i in range(1, len(pts)):
                    cv2.line(frame, pts[i - 1], pts[i], (0, 255, 255), 2)

                # Gate crossing 판단
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

                            available = args.spaces - current_cars if args.spaces > 0 else None

                            log_event(
                                csv_filename,
                                gate.event_type,
                                track_id,
                                current_cars,
                                available
                            )

                            last_count_frame[key] = frame_idx

                            # 이벤트 발생 시 선을 두껍게 강조
                            cv2.line(frame, gate.p1, gate.p2, (0, 255, 0), 7)

                prev_points[track_id] = curr_pt

        # 화면 정보 표시
        y = 35
        cv2.putText(
            frame,
            f"In: {entered_cars} | Out: {exited_cars} | Current: {current_cars}",
            (20, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.85,
            (255, 255, 255),
            2
        )

        y += 38

        if args.spaces > 0:
            available = max(0, args.spaces - current_cars)
            cv2.putText(
                frame,
                f"Total: {args.spaces} | Available: {available}",
                (20, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.85,
                (0, 255, 255),
                2
            )

        if writer is not None:
            writer.write(frame)

        if args.show:
            cv2.imshow("Directional Parking Counter", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()

    if writer is not None:
        writer.release()

    cv2.destroyAllWindows()

    print("----- 테스트 종료 -----")
    print(f"입차: {entered_cars}")
    print(f"출차: {exited_cars}")
    print(f"현재 주차대수: {current_cars}")


if __name__ == "__main__":
    main()