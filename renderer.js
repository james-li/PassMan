const {ipcRenderer} = require('electron');


let allRows = new Map();


async function togglePasswordVisibility(event) {
    const button = event.target;
    const passwordCell = button.closest('tr').querySelector('.password-cell');
    const isHidden = passwordCell.textContent === '******';

    if (isHidden) {
        passwordCell.textContent = passwordCell.dataset.password; // 显示明文密码
        button.textContent = '隐藏';
    } else {
        passwordCell.textContent = '******'; // 隐藏密码
        button.textContent = '显示';
    }
}


async function copyPasswordToClipboard(event) {
    const button = event.target;
    const passwordCell = button.closest('tr').querySelector('.password-cell');
    let passwordToCopy = passwordCell.dataset.password;
    // 将密码复制到剪贴板
    navigator.clipboard.writeText(passwordToCopy).then(() => {
        alert('密码已复制到剪贴板！');
    });
}

function toggleEditRow(event) {
    const button = event.target;
    const tr = button.closest('tr');
    const rowId = tr.querySelector('input[type="checkbox"]').dataset.id;

    if (button.textContent === '编辑') {
        // 切换为编辑状态
        const inputCells = tr.querySelectorAll('td.editable');
        const passwordCell = tr.querySelector('td.password-cell');
        const password = passwordCell.dataset.password;

        inputCells.forEach((cell) => {
            const text = cell.textContent;
            cell.innerHTML = `<input type="text" class="editable" style="width: 95%; box-sizing: border-box;"  value="${text}">`;
        });
        passwordCell.innerHTML = `<input type="password" class="password-cell"  value="${password}">`;
        button.textContent = '确认';
        tr.querySelector(".show-password").disabled = true;
        tr.querySelector(".copy-password").disabled = true;
        tr.querySelector(".delete-row").disabled = true;

    } else {
        // 更新 allRows 数据
        const inputCells = tr.querySelectorAll('input.editable');
        const passwordCell = tr.querySelector('input.password-cell');
        const row = {
            id: rowId,
            server: inputCells[0].value,
            protocol: inputCells[1].value,
            url: inputCells[2].value,
            username: inputCells[3].value,
            password: passwordCell.value
        };
        tr.innerHTML = `
            <td><input type="checkbox" data-id="${row.id}">${row.id}</td>
            <td class="editable">${row.server}</td>
            <td class="editable">${row.protocol}</td>
            <td class="editable">${row.url}</td>
            <td class="editable">${row.username}</td>
            <td class="password-cell" data-password="${row.password}">******</td>
            <td>
                <button class="show-password">显示</button>
                <button class="copy-password">复制</button>
                <button class="edit-row">编辑</button>
                <button class="delete-row">删除</button>
            </td>            
        `;
        addTableEventListeners(tr);
        allRows.set(parseInt(rowId, 10), row);
        button.textContent = '编辑';
        tr.querySelector(".show-password").disabled = false;
        tr.querySelector(".copy-password").disabled = false;
        tr.querySelector(".delete-row").disabled = false;

    }
}

function deleteRow(event) {
    const tr = event.target.closest('tr');
    const rowId = tr.querySelector('input[type="checkbox"]').dataset.id;

    // 从 allRows 删除记录
    allRows.delete(parseInt(rowId, 10));

    // 从表格中移除行
    tr.remove();
}


// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadCredentials();
    } catch (error) {
        console.error('初始化加密密钥界面失败:', error);
    }
});


function showKeyInputModal(hasRecords) {
    document.getElementById('keyInput1').value = "";
    document.getElementById('keyInput2').value = "";
    const createOrVerifyDiv = document.getElementById('createOrVerify');
    const passwordVerifyDiv = document.getElementById('passwordVerify');

    if (hasRecords) {
        // 如果 encrypt_keys 表有记录
        createOrVerifyDiv.innerHTML = '<h3 style="text-align: center;">请输入密钥</h3>';
        passwordVerifyDiv.style.display = 'none'; // 隐藏确认密钥输入框
    } else {
        // 如果 encrypt_keys 表没有记录
        createOrVerifyDiv.innerHTML = '<h3 style="text-align: center;">新建密码数据库，请输入加密密钥</h3>';
        passwordVerifyDiv.style.display = 'block'; // 显示确认密钥输入框
    }

    // 显示模态框
    document.getElementById('keyInputModal').style.display = 'block';

    // 添加确认和取消按钮的事件处理
}

async function loadCredentials() {
    // 调用主进程检测 encrypt_keys 表是否有记录
    const hasRecords = await ipcRenderer.invoke('check-encrypt-keys'); // 返回布尔值
    showKeyInputModal(hasRecords);
    setupKeyInputHandlers(hasRecords);
}


function setupKeyInputHandlers(hasRecords) {
    const confirmButton = document.getElementById('confirmKeyButton');
    const cancelButton = document.getElementById('cancelKeyButton');

    confirmButton.addEventListener('click', async () => {
        const key1 = document.getElementById('keyInput1').value.trim();
        const key2 = document.getElementById('keyInput2').value.trim();
        if (!key1) {
            alert('密钥不能为空！');
            return;
        }

        if (!hasRecords) {
            // 如果是新建密钥，验证两次输入是否一致
            if (key1 !== key2) {
                alert('两次输入的密钥不一致，请重新输入！');
                return;
            }
        }

        document.getElementById('keyInputModal').style.display = 'none';
        try {
            const projectId = await ipcRenderer.invoke('check-encryption-key', key1);
            console.log('项目 ID:', projectId);

            // 密钥验证成功，加载凭据数据
            const rows = await ipcRenderer.invoke('load-credentials', projectId);
            console.log('加载的凭据数据:', rows);
            if (rows.length > 0) {
                console.log(`数据加载成功！项目 ID：${rows[0].project_id}`);
                allRows.clear(); // 清空之前的数据
                rows.forEach(row => {
                    allRows.set(row.id, row); // 将数据加入 Map，id 为 key
                });

                // 更新 rows 以渲染到表格
                renderTable(rows);
            } else {
                console.log('该项目暂无记录！');
            }

            // 启用按钮
            document.getElementById('resetKey').disabled = false;
            document.getElementById('addRow').disabled = false;
            document.getElementById('deleteRows').disabled = false;
            document.getElementById('saveRows').disabled = false;
        } catch (error) {
            alert(`加载失败：${error}`);
        }

        cancelButton.addEventListener('click', () => {
            // 隐藏模态框
            document.getElementById('keyInputModal').style.display = 'none';
        });
    });
}

document.getElementById('cancelKeyButton').addEventListener('click', () => {
    document.getElementById('keyInputModal').style.display = 'none';
});


document.getElementById('loadDatabase').addEventListener('click', async () => {
    try {
        const filePath = await ipcRenderer.invoke('load-database');
        if (filePath != null) {
            await loadCredentials()
            document.getElementById('resetKey').disabled = true;
            document.getElementById('addRow').disabled = true;
            document.getElementById('deleteRows').disabled = true;
            document.getElementById('saveRows').disabled = true;
        }

    } catch (error) {
        alert("加载数据库失败: " + error.message)
    }
});

document.getElementById('resetKey').addEventListener('click', async () => {
    showKeyInputModal(false);
    const confirmButton = document.getElementById('confirmKeyButton');
    const cancelButton = document.getElementById('cancelKeyButton');

    confirmButton.addEventListener('click', async () => {
        const key1 = document.getElementById('keyInput1').value.trim();
        const key2 = document.getElementById('keyInput2').value.trim();
        if (!key1) {
            alert('密钥不能为空！');
            return;
        }

        if (key1 !== key2) {
            alert('两次输入的密钥不一致，请重新输入！');
            return;
        }

        document.getElementById('keyInputModal').style.display = 'none';
        try {
            await ipcRenderer.invoke("reset-encryption-key", key1);
            await ipcRenderer.invoke("save-credentials", Array.from(allRows.values()));

            // 启用按钮
            document.getElementById('resetKey').disabled = false;
            document.getElementById('addRow').disabled = false;
            document.getElementById('deleteRows').disabled = false;
            document.getElementById('saveRows').disabled = false;
        } catch (error) {
            alert(`重置密钥失败：${error}`);
        }
    });
    cancelButton.addEventListener('click', () => {
        // 隐藏模态框
        document.getElementById('keyInputModal').style.display = 'none';
    });

});


function renderTable(rows) {
    const tbody = document.querySelector('#passwordTable tbody');
    tbody.innerHTML = '';

    rows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" data-id="${row.id}">${row.id}</td>
            <td class="editable">${row.server}</td>
            <td class="editable">${row.protocol}</td>
            <td class="editable">${row.url}</td>
            <td class="editable">${row.username}</td>
            <td class="password-cell" data-password="${row.password}">******</td>
            <td>
                <button class="show-password">显示</button>
                <button class="copy-password">复制</button>
                <button class="edit-row">编辑</button>
                <button class="delete-row">删除</button>
            </td>            
        `;
        tbody.appendChild(tr);
        addTableEventListeners(tr); // 绑定按钮事件
    });

    // 初始化全选状态
    // updateSelectAllCheckbox();
}

function addTableEventListeners(tr) {
    tr.querySelectorAll('.show-password').forEach((button) => {
        button.addEventListener('click', togglePasswordVisibility);
    });

    tr.querySelectorAll('.copy-password').forEach((button) => {
        button.addEventListener('click', copyPasswordToClipboard);
    });

    tr.querySelectorAll('.edit-row').forEach((button) => {
        button.addEventListener('click', toggleEditRow);
    });

    tr.querySelectorAll('.delete-row').forEach((button) => {
        button.addEventListener('click', deleteRow);
    });
}


document.getElementById('addRow').addEventListener('click', () => {
    ipcRenderer.send("set-changed");
    // 在 tbody 中插入一行新的 tr
    const tbody = document.querySelector('#passwordTable tbody');
    const tr = document.createElement('tr');
    // 计算 allRows 中的最大 id
    const maxId = Math.max(...Array.from(allRows.keys()), 0); // 如果 allRows 为空，返回 0

    // 生成新行的 id
    const newId = maxId + 1;
    // 创建空记录
    const emptyRow = {
        id: newId,
        server: '',
        protocol: '',
        url: '',
        username: '',
        password: '',
    };
    // 添加到 allRows
    allRows.set(newId, emptyRow);
    // 创建新行的单元格，并在其中添加输入框
    tr.innerHTML = `
        <td><input type="checkbox" data-id="${newId}">${newId}</td>        
        <td><input type="text" class="editable" style="width: 95%; box-sizing: border-box;" placeholder="服务器"></td>
        <td><input type="text" class="editable" style="width: 95%; box-sizing: border-box;" placeholder="协议" value="www"></td>
        <td><input type="text" class="editable" style="width: 95%; box-sizing: border-box;" placeholder="访问地址"></td>
        <td><input type="text" class="editable" style="width: 95%; box-sizing: border-box;" placeholder="用户名"></td>
        <td><input type="password" class="password-cell" style="width: 95%; box-sizing: border-box;" placeholder="密码"></td>
        <td>
            <button class="show-password">显示</button>
            <button class="copy-password">复制</button>
            <button class="edit-row">确认</button>
            <button class="delete-row">删除</button>
        </td>             
    `;
    addTableEventListeners(tr);
    tbody.appendChild(tr); // 将新行添加到表格中

});


document.getElementById('deleteRows').addEventListener('click', () => {
    ipcRenderer.send("set-changed");
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
        alert('请选择要删除的记录！');
        return;
    }

    // 获取选中记录的 id
    const idsToDelete = Array.from(checkboxes).map(checkbox => parseInt(checkbox.dataset.id, 10));
    idsToDelete.forEach(id => allRows.delete(id));
    renderTable(Array.from(allRows.values())); // 重新渲染表格
});


document.getElementById('queryRows').addEventListener('click', () => {
    const searchServer = document.getElementById('queryServer').value.trim().toLowerCase();
    const searchProtocol = document.getElementById('queryProtocol').value; // 获取协议（包括 'all'）

    // 过滤出匹配的行
    const filteredRows = Array.from(allRows.values()).filter(row => {
        const matchesServer = row.server.toLowerCase().includes(searchServer);
        const matchesProtocol = searchProtocol === 'all' || row.protocol.toLowerCase() === searchProtocol.toLowerCase();
        return matchesServer && matchesProtocol;
    });

    renderTable(filteredRows); // 渲染匹配的结果
});


document.getElementById('saveRows').addEventListener('click', async () => {
    try {
        //TODO： allRows过滤server/url/username/password 为空的记录
        // 过滤无效记录并更新 allRows
        const validRows = Array.from(allRows.entries()) // 获取键值对 [id, row]
            .filter(([, row]) => {
                // 保留所有字段非空的记录
                return row.server.trim() !== '' &&
                    row.url.trim() !== '' &&
                    row.username.trim() !== '' &&
                    row.password.trim() !== '';
            });

        // 更新 allRows 以移除无效记录
        allRows = new Map(validRows);
        await ipcRenderer.invoke('save-credentials', Array.from(allRows.values())); // 调用主进程保存数据
        // alert('保存成功！');
        renderTable(Array.from(allRows.values()));
    } catch (error) {
        alert(`保存失败：${error}`);
    }
});


document.getElementById('resetRows').addEventListener('click', () => {
    document.getElementById('queryServer').value = '';
    document.getElementById('queryProtocol').value = 'all';
    renderTable(Array.from(allRows.values()))
});

// 全选复选框逻辑
document.getElementById('selectAllCheckbox').addEventListener('change', (event) => {
    const checkboxes = document.querySelectorAll('#passwordTable tbody input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = event.target.checked;
    });
});


