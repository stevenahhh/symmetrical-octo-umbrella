<<<<<<< HEAD
import easyocr
import re # 정규표현식(필터링)을 위한 기본 라이브러리

print("AI 모델을 불러오는 중입니다...")
reader = easyocr.Reader(['ko', 'en'])

IMAGE_PATH = 'test_car.jpg'
print(f"📸 '{IMAGE_PATH}' 이미지 분석을 시작합니다.\n")

results = reader.readtext(IMAGE_PATH, detail=1)

# 한국 번호판 패턴을 찾는 정규표현식 (숫자2~3개 + 한글1개 + 숫자4개)
plate_pattern = re.compile(r'\d{2,3}[가-힣]\d{4}')

print("="*50)
print(" [AI 번호판 인식 및 정제 결과]")
print("="*50)

valid_plates = [] 

for bbox, text, confidence in results:
    # 텍스트에서 공백, 특수문자, 괄호 등 쓰레기값을 전부 제거
    # '123가 2333)' -> '123가 2333' 으로 압축
    clean_text = re.sub(r'[^가-힣0-9]', '', text) 
    
    # 압축된 글자가 우리가 정한 번호판 패턴과 일치하는지 검사
    match = plate_pattern.search(clean_text)
    
    # 만약 패턴이 일치한다면? 
    if match:
        extracted_plate = match.group() # 완벽하게 정제된 번호판 텍스트만 추출
        valid_plates.append((extracted_plate, confidence))
        
        print(f" 최종 정제된 번호판 : {extracted_plate}")
        print(f" 신뢰도 점수 : {confidence:.4f} ({(confidence*100):.1f}%)")
        print("-" * 50)



if not valid_plates:
    print(" 사진에서 유효한 번호판 패턴을 찾지 못했습니다.")
else:
=======
import easyocr
import re # 정규표현식(필터링)을 위한 기본 라이브러리

print("AI 모델을 불러오는 중입니다...")
reader = easyocr.Reader(['ko', 'en'])

IMAGE_PATH = 'test_car.jpg'
print(f"📸 '{IMAGE_PATH}' 이미지 분석을 시작합니다.\n")

results = reader.readtext(IMAGE_PATH, detail=1)

# 한국 번호판 패턴을 찾는 정규표현식 (숫자2~3개 + 한글1개 + 숫자4개)
plate_pattern = re.compile(r'\d{2,3}[가-힣]\d{4}')

print("="*50)
print(" [AI 번호판 인식 및 정제 결과]")
print("="*50)

valid_plates = [] 

for bbox, text, confidence in results:
    # 텍스트에서 공백, 특수문자, 괄호 등 쓰레기값을 전부 제거
    # '123가 2333)' -> '123가 2333' 으로 압축
    clean_text = re.sub(r'[^가-힣0-9]', '', text) 
    
    # 압축된 글자가 우리가 정한 번호판 패턴과 일치하는지 검사
    match = plate_pattern.search(clean_text)
    
    # 만약 패턴이 일치한다면? 
    if match:
        extracted_plate = match.group() # 완벽하게 정제된 번호판 텍스트만 추출
        valid_plates.append((extracted_plate, confidence))
        
        print(f" 최종 정제된 번호판 : {extracted_plate}")
        print(f" 신뢰도 점수 : {confidence:.4f} ({(confidence*100):.1f}%)")
        print("-" * 50)



if not valid_plates:
    print(" 사진에서 유효한 번호판 패턴을 찾지 못했습니다.")
else:
>>>>>>> 89cde61 (fix: App.jsx 클릭 에러 수정중,  전체 프로젝트 업데이트)
    print(" AI 비전 분석 및 후처리 완료!")