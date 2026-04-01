import sys, re

# Update App.jsx
with open('App.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

new_state = "  const [selectedId, setSelectedId] = useState('객체를 클릭해주세요');\n  const [selectedArea, setSelectedArea] = useState(0);"
text = re.sub(r"  const \[selectedId, setSelectedId\] = useState\('객체를 클릭해주세요'\);", new_state, text)

old_usememo = """  const currentData = useMemo(() => {
    if (DUMMY_DATA[selectedId]) return DUMMY_DATA[selectedId];
    if (selectedId === '객체를 클릭해주세요' || selectedId.startsWith('RPT-')) return DUMMY_DATA['선택된 객체 없음'];
    // Generate some random realistic numbers based on string length to look deterministic
    const hash = selectedId.length * 123;
    return {
      power: (Math.floor(hash * 3.4) + 1200).toLocaleString() + ' kWh',
      solar: (Math.floor(hash * 1.5) + 400).toLocaleString() + ' kWh',
      roofArea: Math.floor(hash * 1.2) + 500,
      status: [
        { name: '메인 전력량계', status: '정상', isGood: true, value: (Math.floor(hash * 3.4) + 1200) + ' kWh', icon: Zap },
        { name: '태양광 인버터', status: '정상', isGood: true, value: (Math.floor(hash * 0.1) % 10 + 90) + '% 효율', icon: Sun }
      ]
    };
  }, [selectedId]);"""

new_usememo = """  const currentData = useMemo(() => {
    if (DUMMY_DATA[selectedId]) return { ...DUMMY_DATA[selectedId], roofArea: selectedArea > 0 ? selectedArea : DUMMY_DATA[selectedId].roofArea };
    if (selectedId === '객체를 클릭해주세요' || selectedId.startsWith('RPT-')) return DUMMY_DATA['선택된 객체 없음'];
    const hash = selectedId.length * 123;
    const finalArea = selectedArea > 0 ? selectedArea : (Math.floor(hash * 1.2) + 500);
    return {
      power: (Math.floor(hash * 3.4) + 1200).toLocaleString() + ' kWh',
      solar: (Math.floor(hash * 1.5) + 400).toLocaleString() + ' kWh',
      roofArea: finalArea,
      status: [
        { name: '메인 전력량계', status: '정상', isGood: true, value: (Math.floor(hash * 3.4) + 1200) + ' kWh', icon: Zap },
        { name: '태양광 인버터', status: '정상', isGood: true, value: (Math.floor(hash * 0.1) % 10 + 90) + '% 효율', icon: Sun }
      ]
    };
  }, [selectedId, selectedArea]);"""

text = text.replace(old_usememo, new_usememo)
text = text.replace("<CityModel onSelect={setSelectedId} selectedId={selectedId} />", "<CityModel onSelect={(name, area) => { setSelectedId(name); if(area) setSelectedArea(area); }} selectedId={selectedId} />")

with open('App.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

# Update CityModel.jsx
with open('CityModel.jsx', 'r', encoding='utf-8') as f:
    text_city = f.read()

old_click = """    const box = new THREE.Box3().setFromObject(e.object);
    const center = box.getCenter(new THREE.Vector3());
    setTargetPos(center);

    if (onSelect) onSelect(name);"""

new_click = """    const box = new THREE.Box3().setFromObject(e.object);
    const center = box.getCenter(new THREE.Vector3());
    setTargetPos(center);

    // Calculate actual roof area (X * Z) in square meters
    const size = new THREE.Vector3();
    box.getSize(size);
    // Apply a realistic scaling factor if necessary, e.g. * 100 for visual scale to real-world
    const area = Math.round((size.x * 20) * (size.z * 20));

    if (onSelect) onSelect(name, area);"""

text_city = text_city.replace(old_click, new_click)

with open('CityModel.jsx', 'w', encoding='utf-8') as f:
    f.write(text_city)

print("Updated perfectly.")
