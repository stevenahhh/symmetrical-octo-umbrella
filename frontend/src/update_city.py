import sys, re

with open('CityModel.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

new_handle_click = """  const handleClick = (e) => {
    if (e.delta > 2) return;

    let name = e.object.parent && e.object.parent.name !== 'Scene'
      ? e.object.parent.name
      : e.object.name;

    if (name && name.includes('학교')) return;

    e.stopPropagation();

    if (!name || name === '') name = '알 수 없는 객체';

    const box = new THREE.Box3().setFromObject(e.object);
    const center = box.getCenter(new THREE.Vector3());
    setTargetPos(center);

    if (onSelect) onSelect(name);
  };"""

text = re.sub(
    r'  const handleClick = \(e\) => \{.*?if \(onSelect\) onSelect\(name\);\n  \};',
    new_handle_click,
    text,
    flags=re.DOTALL
)

new_return = """  return (
    <primitive
      object={scene}
      {...props}
      onClick={handleClick}
      onPointerOver={(e) => {
        let name = e.object.parent && e.object.parent.name !== 'Scene' ? e.object.parent.name : e.object.name;
        if (name && name.includes('학교')) return;
        
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    />
  );"""

text = re.sub(
    r'  return \(\n    <primitive.*?/>\n  \);',
    new_return,
    text,
    flags=re.DOTALL
)

with open('CityModel.jsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Updated CityModel.jsx successfully")
