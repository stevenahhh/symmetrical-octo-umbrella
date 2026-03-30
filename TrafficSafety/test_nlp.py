from sentence_transformers import SentenceTransformer, util

# 1. 한국어에 특화된 고성능 언어 모델 로드 (jhgan/ko-sroberta-multitask)
print(" 한국어 전용 NLP 모델을 불러오는 중입니다... (최초 1회 다운로드 발생)")
model = SentenceTransformer('jhgan/ko-sroberta-multitask')

# 2. 비교할 제보 문장들 세팅 (아까 실패했던 그 문장들 그대로!)
sentence_A = "도서관 앞 가로등이 완전히 박살났어요"
sentence_B = "공대 건물 쪽에 조명 기둥이 쓰러져 있습니다" 
sentence_C = "학생식당 메뉴판이 떨어졌네요" 

print("\n [한국어 특화 AI 문맥 유사도 분석 시작]\n")

# 3. 문장을 고차원 숫자 벡터로 변환 (Embedding)
emb_A = model.encode(sentence_A)
emb_B = model.encode(sentence_B)
emb_C = model.encode(sentence_C)

# 4. 코사인 유사도(Cosine Similarity) 계산 
sim_AB = util.cos_sim(emb_A, emb_B).item()
sim_AC = util.cos_sim(emb_A, emb_C).item()

# 5. 결과 출력
print("="*50)
print(f"🔹 제보 A: '{sentence_A}'")
print(f"🔹 제보 B: '{sentence_B}'")
print(f"📊 유사도 점수: {sim_AB:.4f} ({(sim_AB*100):.1f}%) -> 같은 사건일 확률!")
print("-" * 50)

print(f"🔹 제보 A: '{sentence_A}'")
print(f"🔹 제보 C: '{sentence_C}'")
print(f"📊 유사도 점수: {sim_AC:.4f} ({(sim_AC*100):.1f}%) -> 같은 사건일 확률!")
print("="*50)