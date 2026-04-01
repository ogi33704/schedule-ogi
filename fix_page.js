const fs = require('fs');
let contents = fs.readFileSync('src/app/page.tsx', 'utf8');

const regex = /<div className="flex flex-col">\s*<span className="font-bold"[^>]*>\{getAutoTimeRange\(slot\.time\)\}<\/span>\s*<span[^>]*>責任者: \{slot\.isConductor2Lead \? slot\.conductor2 : slot\.conductor\}<\/span>\s*<\/div>[\s\S]*?\}\)\(\)\}/g;

const newStr = `<div className="flex flex-col">
                                <span className="font-bold" style={{ fontSize: '1.6rem', color: '#f97316', lineHeight: 1 }}>{getAutoTimeRange(slot.time)}</span>
                                <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>責任者: {slot.isConductor2Lead ? slot.conductor2 : slot.conductor}</span>
                              </div>
                              {slotApps.some(a => savedName !== '' && a.name === savedName) ? null : (
                                <button 
                                  onClick={() => handleApply(slot, date)} 
                                  className="btn btn-primary animate-fade-in" 
                                  style={{ backgroundColor: '#fb923c', padding: '0.8rem 1.25rem', fontSize: '1.1rem', borderRadius: '12px' }}
                                >この枠で申し込む</button>
                              )}
                            </div>

                            {(() => {
                              const myApps = slotApps.filter(a => savedName !== '' && a.name === savedName);
                              if (myApps.length > 0) {
                                return (
                                  <div className="flex flex-col gap-3 bg-rose-50 p-4 rounded-xl border border-rose-100 mt-2 animate-fade-in w-full">
                                    <div className="flex justify-between items-center flex-wrap gap-2 w-full">
                                      <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#e11d48' }}>✅ あなたはこの枠に申込済みです</span>
                                      <button 
                                        onClick={() => removeApplicant(myApps[0].id, myApps[0].name)} 
                                        style={{ 
                                          padding: '6px 12px', fontSize: '0.85rem', color: '#ef4444', border: '1.5px solid #ffcfcf', 
                                          borderRadius: '8px', backgroundColor: '#fff', fontWeight: 'bold' 
                                        }}
                                      >取消す</button>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}`;

const fixedContents = contents.replace(regex, newStr);

if (contents !== fixedContents) {
    fs.writeFileSync('src/app/page.tsx', fixedContents);
    console.log("Success! Regex matched and fixed.");
} else {
    console.log("Error: Regex didn't match anything.");
}
