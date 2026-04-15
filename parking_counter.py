import cv2
import csv
import os
import argparse
from datetime import datetime
from ultralytics import YOLO

def log_event(csv_filename, event_type, track_id, current_in, available):
    with open(csv_filename, mode='a', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        avail_str = available if available is not None else "N/A"
        writer.writerow([now, event_type, track_id, current_in, avail_str])
        print(f"[{now}] {event_type} - 차량 ID: {track_id} | 잔여: {avail_str}")

def main():
   #터미널 인자(Arguments) 설정
    parser = argparse.ArgumentParser(description="YOLOv8 기반 주차장 입출차 카운터")
    parser.add_argument('--source', type=str, required=True, help='비디오 파일 경로 (예: parking.mp4)')
    parser.add_argument('--line', type=float, default=0.5, help='기준선 위치 비율 (0.0 맨 위 ~ 1.0 맨 아래, 기본: 0.5)')
    parser.add_argument('--direction', type=str, default='up_to_down', choices=['up_to_down', 'down_to_up'], help='입차 방향 (기본: up_to_down)')
    parser.add_argument('--conf', type=float, default=0.4, help='객체 인식 신뢰도 임계값 (기본: 0.4)')
    parser.add_argument('--spaces', type=int, default=50, help='전체 주차 공간 (0이면 단순 통행량 카운트로 동작)')
    
    args = parser.parse_args()

    # 모델 및 비디오 소스 설정
    model = YOLO('yolov8n.pt')
    cap = cv2.VideoCapture(args.source)

    if not cap.isOpened():
        print(f"에러: 비디오 파일({args.source})을 열 수 없습니다.")
        return

    # 영상의 해상도로 기준선의 실제 픽셀 Y좌표 계산
    video_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    video_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    COUNTING_LINE_Y = int(video_height * args.line)


# 상태 변수 및 CSV 설정
    track_history = {}
    current_cars = 0
    entered_cars = 0
    exited_cars = 0
    TOTAL_SPACES = args.spaces

    # 소스 경로에서 파일명만 추출 (예: 'video/car_test.mp4' -> 'car_test')
    source_name = os.path.splitext(os.path.basename(args.source))[0]
    
    # 현재 시간(예: 11월 05일 14시 30분 -> '11_05_1430')
    time_str = datetime.now().strftime("%m_%d_%H%M")
    
    # CSV 파일(예: '11_05_1430_car_test.csv')
    csv_filename = f"{time_str}_{source_name}.csv"

    file_exists = os.path.isfile(csv_filename)
    with open(csv_filename, mode='a', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["시간", "이벤트", "차량ID", "현재_주차대수", "잔여_주차공간"])

    print(f"--- [테스트 시작] 소스: {args.source} | 파일명: {csv_filename} | 기준선 높이: {COUNTING_LINE_Y}px ---")

    # 영상 처리 루프
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            break

        results = model.track(
            frame, 
            classes=[2, 3, 5, 7], 
            conf=args.conf, 
            iou=0.4,                  
            persist=True, 
            tracker="bytetrack.yaml", 
            verbose=False
        )

        # 화면에 기준선 생성
        cv2.line(frame, (0, COUNTING_LINE_Y), (video_width, COUNTING_LINE_Y), (255, 0, 0), 2)

        if results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            track_ids = results[0].boxes.id.cpu().numpy()

            for box, track_id in zip(boxes, track_ids):
                x1, y1, x2, y2 = map(int, box)
                center_x = int((x1 + x2) / 2)
                center_y = int((y1 + y2) / 2)

                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.circle(frame, (center_x, center_y), 5, (0, 0, 255), -1)
                cv2.putText(frame, f"ID: {int(track_id)}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

                # 방향 판별 및 데이터 기록
                if track_id in track_history:
                    prev_y = track_history[track_id]

                    is_entered = False
                    is_exited = False

                    # 사용자 설정 입차 방향에 따른 로직 분기
                    if args.direction == 'up_to_down':
                        if prev_y < COUNTING_LINE_Y and center_y >= COUNTING_LINE_Y:
                            is_entered = True
                        elif prev_y > COUNTING_LINE_Y and center_y <= COUNTING_LINE_Y:
                            is_exited = True
                    elif args.direction == 'down_to_up':
                        if prev_y > COUNTING_LINE_Y and center_y <= COUNTING_LINE_Y:
                            is_entered = True
                        elif prev_y < COUNTING_LINE_Y and center_y >= COUNTING_LINE_Y:
                            is_exited = True

                    available_spaces = TOTAL_SPACES - current_cars if TOTAL_SPACES > 0 else None

                    if is_entered:
                        entered_cars += 1
                        current_cars += 1
                        available_spaces = TOTAL_SPACES - current_cars if TOTAL_SPACES > 0 else None
                        log_event(csv_filename, "입차", int(track_id), current_cars, available_spaces)
                        cv2.line(frame, (0, COUNTING_LINE_Y), (video_width, COUNTING_LINE_Y), (0, 255, 0), 5) # 초록색 선 표시

                    elif is_exited:
                        exited_cars += 1
                        current_cars = max(0, current_cars - 1)
                        available_spaces = TOTAL_SPACES - current_cars if TOTAL_SPACES > 0 else None
                        log_event(csv_filename, "출차", int(track_id), current_cars, available_spaces)
                        cv2.line(frame, (0, COUNTING_LINE_Y), (video_width, COUNTING_LINE_Y), (0, 0, 255), 5) # 빨간색 선 표시

                track_history[track_id] = center_y

        # 화면에 정보 출력
        y_offset = 40
        if TOTAL_SPACES > 0:
            available_spaces = TOTAL_SPACES - current_cars
            cv2.putText(frame, f"Total Spaces: {TOTAL_SPACES}", (20, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            y_offset += 40
            cv2.putText(frame, f"Available: {available_spaces}", (20, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
            y_offset += 40
            
        cv2.putText(frame, f"In: {entered_cars} | Out: {exited_cars}", (20, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 100, 100), 2)

        cv2.imshow("Smart Parking Monitor", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("--- 테스트 종료 ---")

if __name__ == "__main__":
    main()