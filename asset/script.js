async function loadList() {
    const listDiv = document.getElementById('list');
    
    // 로딩 중일 때 깜빡임 방지를 위해 내용이 없을 때만 로딩 표시 (선택사항)
    // listDiv.innerHTML = '로딩 중...'; 

    try {
        const res = await fetch('api.php?action=list');
        
        if (!res.ok) {
            const text = await res.text();
            // JSON 파싱 에러 방지 및 에러 메시지 출력
            listDiv.innerHTML = `<div style="color:#f87171">서버 오류 (HTTP ${res.status}): ${text.substring(0, 100)}... <br>Web Station PHP 설정(mysqli)이나 DB 포트를 확인하세요.</div>`;
            return;
        }

        const data = await res.json();
        
        if (data.error) {
            listDiv.innerHTML = `<div style="color:#fbbf24">오류: ${data.error}</div>`;
            return;
        }

        if (data.length === 0) {
            listDiv.innerHTML = `<div style="color:#94a3b8; text-align:center; padding:20px;">최근 7일간의 히스토리가 없습니다.</div>`;
            return;
        }

        listDiv.innerHTML = data.map(item => {
            const info = item.info;
            const alias = item.alias || ''; // DB에 저장된 별명
            
            // RD 상태값에 따른 텍스트/색상 처리
            let statusColor = '#94a3b8';
            if(info.status === 'downloaded') statusColor = '#10b981'; // 완료: 녹색
            if(info.status === 'downloading') statusColor = '#a855f7'; // 다운중: 보라색

            return `
                <div class="card">
                    <div class="card-header">
                        <div class="title-area">
                            <div class="filename" title="${info.filename}">${info.filename}</div>
                            <div class="alias-box" style="margin-top:5px; display:flex; gap:5px;">
                                <input type="text" id="alias-${item.rd_id}" value="${alias}" placeholder="별명 입력" 
                                    style="background:#0f172a; border:1px solid #334155; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem;">
                                <button onclick="updateAlias('${item.rd_id}')" 
                                    style="background:#334155; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem; padding:0 8px;">저장</button>
                            </div>
                        </div>
                        <button class="btn-del" onclick="deleteItem('${item.rd_id}')">삭제 🗑️</button>
                    </div>
                    
                    <div class="progress-container">
                        <div class="progress-fill" style="width:${info.progress}%; background: ${info.status === 'downloaded' ? '#10b981' : 'linear-gradient(90deg, #8b5cf6, #d946ef)'}"></div>
                    </div>
                    
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#cbd5e1; margin-bottom:10px;">
                        <span style="color:${statusColor}">● ${info.status}</span>
                        <span>${info.progress}% (${(info.bytes / 1024 / 1024 / 1024).toFixed(2)} GB)</span>
                    </div>

                    ${info.status === 'downloaded' ? `
                        <div style="margin-top:10px; padding:10px; background:#0f172a; border-radius:8px; border:1px solid #334155;">
                            ${info.links.map((link, idx) => `
                                <a href="${link}" target="_blank" class="download-link">
                                    📥 다운로드 링크 ${idx+1} (클릭)
                                </a>
                            `).join('')}
                        </div>
                    ` : ''}

                    <details>
                        <summary>📂 내부 파일 목록 보기 (${info.files ? info.files.length : 0}개)</summary>
                        <div class="file-list">
                            ${info.files ? info.files.map(f => `
                                <div style="padding:4px 0; border-bottom:1px solid #1e293b; display:flex; justify-content:space-between;">
                                    <span>${f.path}</span>
                                    <span style="color:#64748b;">${(f.bytes / 1024 / 1024).toFixed(1)} MB</span>
                                </div>`).join('') : '<div style="padding:5px;">목록 없음</div>'}
                        </div>
                    </details>
                </div>
            `;
        }).join('');

    } catch (e) {
        listDiv.innerHTML = `<div style="color:#ef4444">연결 실패: ${e.message}</div>`;
    }
}

// 별명 업데이트 함수
async function updateAlias(rd_id) {
    const aliasInput = document.getElementById(`alias-${rd_id}`);
    const newAlias = aliasInput.value;
    
    const fd = new FormData();
    fd.append('action', 'updateAlias');
    fd.append('rd_id', rd_id);
    fd.append('alias', newAlias);

    try {
        await fetch('api.php', { method: 'POST', body: fd });
        alert('별명이 저장되었습니다.');
        loadList(); // 목록 새로고침
    } catch(e) {
        alert('저장 실패');
    }
}

async function addMag() {
    const mag = document.getElementById('magIn').value;
    if(!mag) return alert('마그넷 링크를 입력하세요.');
    
    const btn = document.querySelector('.btn-purple');
    const originalText = btn.innerText;
    btn.innerText = '전송 중...';
    
    const fd = new FormData();
    fd.append('magnet', mag);
    await fetch('api.php?action=addMagnet', { method: 'POST', body: fd });
    
    document.getElementById('magIn').value = '';
    btn.innerText = originalText;
    loadList();
}

async function deleteItem(id) {
    if(!confirm('정말 삭제하시겠습니까? (RD 클라우드 및 DB 기록 삭제)')) return;
    const fd = new FormData();
    fd.append('rd_id', id);
    await fetch('api.php?action=delete', { method: 'POST', body: fd });
    loadList();
}

// 5초마다 상태 갱신
setInterval(loadList, 5000);
loadList();