import sys, re

with open('App.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

new_dummy = """  const currentData = useMemo(() => {
    if (DUMMY_DATA[selectedId]) return DUMMY_DATA[selectedId];
    if (selectedId === '객체를 클릭해주세요' || selectedId.startsWith('RPT:')) return DUMMY_DATA['선택된 객체 없음'];
    const hash = selectedId.length * 123 + selectedId.charCodeAt(0) * 10;
    return {
      power: (Math.floor(hash % 34) * 100 + 1200).toLocaleString() + ' kWh',
      solar: (Math.floor(hash % 15) * 100 + 400).toLocaleString() + ' kWh',
      roofArea: Math.floor(hash % 12) * 100 + 500,
      status: [
        { name: '메인 전력량계', status: '정상', isGood: true, value: (Math.floor(hash % 34) * 100 + 1200) + ' kWh', icon: Zap },
        { name: '태양광 인버터', status: '정상', isGood: true, value: (Math.floor(hash % 10) + 90) + '% 효율', icon: Sun }
      ]
    };
  }, [selectedId]);"""

text = re.sub(r'const currentData = DUMMY_DATA\[selectedId\] \|\| DUMMY_DATA\[\'선택된 객체 없음\'\];', new_dummy.strip(), text)

new_markers = """<CityModel onSelect={setSelectedId} selectedId={selectedId} />
                {mainTab === 'traffic' && trafficData.map((d, i) => {
                   const X_OFFSET = 265;
                   const Z_OFFSET = -80;
                   const SCALE = 14500;
                   const x = (d.longitude - 127.4810) * SCALE + X_OFFSET;
                   const z = -(d.latitude - 34.9690) * SCALE + Z_OFFSET;
                   const isAlert = d.status === '확정';
                   const color = isAlert ? 'bg-red-500' : 'bg-gray-400/90';
                   const isSelectedMarker = selectedId === `RPT:${d.report_id}`;
                   
                   return (
                     <mesh key={i} position={[x, 5, z]}>
                       <Html center zIndexRange={[100, 0]}>
                         <div className="relative flex flex-col items-center">
                           {isSelectedMarker && (
                             <div className="absolute bottom-[calc(100%+8px)] w-max max-w-[200px] bg-white text-slate-800 p-3 rounded-2xl shadow-xl border border-gray-100 flex flex-col pointer-events-none z-[1000]">
                               <strong className="text-sm mb-1 text-blue-600 flex items-center gap-1"><ShieldAlert size={14}/> {d.category}</strong>
                               <span className="text-[10px] text-gray-500">신뢰도: {(d.final_trust_score*100).toFixed(0)}%</span>
                               <span className="text-[10px] font-bold mt-1 text-red-500">{d.status} 처리</span>
                               <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-gray-100 rotate-45"></div>
                             </div>
                           )}
                           <div 
                             className={`p-2 rounded-full text-white shadow-xl ${color} cursor-pointer hover:scale-110 transition-transform ${isSelectedMarker ? 'ring-4 ring-red-200 scale-110' : ''}`}
                             onClick={(e) => { 
                               e.stopPropagation(); 
                               setSelectedId(`RPT:${d.report_id}`); 
                             }}
                           >
                             <AlertTriangle size={isAlert ? 16 : 12} />
                           </div>
                         </div>
                       </Html>
                     </mesh>
                   )
                })}"""

text = re.sub(
    r'<CityModel onSelect=\{setSelectedId\} />.*?</Stage>',
    new_markers.strip() + '\n              </Stage>',
    text,
    flags=re.DOTALL
)

with open('App.jsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Updated successfully")
