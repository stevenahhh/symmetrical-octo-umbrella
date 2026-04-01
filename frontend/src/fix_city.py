import sys, re

with open('CityModel.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Fix material clone issue so only selected building changes color
text = re.sub(
    r'(if \(!child\.userData\.originalColor && child\.material\.color\) \{.*?child\.userData\.originalColor = child\.material\.color\.clone\(\);\s*\})',
    r'child.material = child.material.clone();\n          \1',
    text,
    flags=re.DOTALL
)

# Fix gibberish "학교"
text = text.replace('?숆탳', '학교')
text = text.replace('?????녿뒗 媛앹껜', '알 수 없는 객체')

with open('CityModel.jsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Material and encoding fix applied!")
