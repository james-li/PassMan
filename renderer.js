const { ipcRenderer } = require('electron');

// 全局变量保存分页信息
let currentPage = 1;
let rowsPerPage = 5;

async function showPassword(id, button) {
    const passwordSpan = button.closest('td').querySelector('.password-hidden');
    if (passwordSpan.textContent === '******') {
        const decryptedPassword = await ipcRenderer.invoke('decrypt-password', id);
        passwordSpan.textContent = decryptedPassword; // 显示明文密码
        button.textContent = '🔒'; // 切换图标为隐藏
    } else {
        passwordSpan.textContent = '******'; // 隐藏明文密码
        button.textContent = '👁️'; // 切换回显示图标
    }
}


async function copyPassword(id) {
    const passwordSpan = document.querySelector(`tr input[data-id="${id}"]`).closest('td').querySelector('.password-hidden');
    let passwordToCopy = passwordSpan.textContent;

    // 如果密码是隐藏状态，先解密
    if (passwordToCopy === '******') {
        passwordToCopy = await ipcRenderer.invoke('decrypt-password', id);
    }

    // 将密码复制到剪贴板
    navigator.clipboard.writeText(passwordToCopy).then(() => {
        alert('密码已复制到剪贴板！');
    });
}



async function checkAndLoadCredentials() {
    try {
        const { projectId, credentials } = await ipcRenderer.invoke('load-credentials');
        if (credentials.length > 0) {
            alert(`数据加载成功！项目 ID：${projectId}`);
            renderTable(credentials);
        } else {
            alert('该项目暂无记录！');
        }
    } catch (error) {
        if (error.includes('加密密钥未设置')) {
            await promptAndSetEncryptionKey(); // 提示用户输入密钥
        } else {
            alert(error); // 其他错误提示
        }
    }
}

// 提示用户输入密钥并设置
async function promptAndSetEncryptionKey() {
    const userKey = prompt('请输入加密密钥：');
    if (!userKey) {
        alert('加密密钥不能为空！');
        return;
    }

    try {
        const projectId = await ipcRenderer.invoke('set-encryption-key', userKey);
        alert(`密钥设置成功！项目 ID：${projectId}`);
        await checkAndLoadCredentials(); // 重新加载数据
    } catch (error) {
        alert(error); // 提示错误信息
        await promptAndSetEncryptionKey(); // 递归重新提示用户输入密钥
    }
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    await checkAndLoadCredentials(); // 检查并加载数据
});




document.getElementById('loadDatabase').addEventListener('click', async () => {
    const filePath = await ipcRenderer.invoke('load-database');
    if (filePath) {
        document.getElementById('keyInputModal').style.display = 'block';
    }
});

document.getElementById('confirmKeyButton').addEventListener('click', () => {
    const key1 = document.getElementById('keyInput1').value;
    const key2 = document.getElementById('keyInput2').value;

    if (!key1 || !key2) {
        alert('密钥不能为空！');
        return;
    }

    if (key1 !== key2) {
        alert('两次输入的密钥不一致，请重试！');
        return;
    }

    ipcRenderer.send('set-encryption-key', key1);
    document.getElementById('keyInputModal').style.display = 'none';
    loadCredentials();
});

function loadCredentials() {
    ipcRenderer.invoke('load-credentials').then((rows) => {
        renderTable(rows);
    });
}

function renderTable(rows) {
    const tbody = document.querySelector('#passwordTable tbody');
    tbody.innerHTML = '';

    rows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.server}</td>
            <td>${row.protocol}</td>
            <td>${row.url}</td>
            <td>${row.username}</td>
            <td>
                <span class="password-hidden">******</span>
                <span class="password-actions">
                    <button onclick="showPassword(${row.id}, this)">👁️</button>
                    <button onclick="copyPassword(${row.id})">📋</button>
                </span>
            </td>
                        <td><input type="checkbox" data-id="${row.id}"></td>
        `;
        tbody.appendChild(tr);

        // 监听复选框状态变化，更新全选复选框
        const checkbox = tr.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', updateSelectAllCheckbox);
    });

    // 初始化全选状态
    updateSelectAllCheckbox();
}


document.getElementById('addRow').addEventListener('click', async () => {
    const tbody = document.querySelector('#passwordTable tbody');

    // 获取协议集合
    const protocols = await ipcRenderer.invoke('get-protocols');

    // 创建新行
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" placeholder="服务器"></td>
        <td>
            <select>
                ${protocols.map(protocol => `<option value="${protocol}">${protocol}</option>`).join('')}
            </select>
        </td>
        <td><input type="text" placeholder="访问地址"></td>
        <td><input type="text" placeholder="用户名"></td>
        <td><input type="password" placeholder="密码"></td>
        <td><input type="checkbox"></td>
    `;
    tbody.prepend(tr);

    // 自动保存新增行数据
    const inputs = tr.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.addEventListener('blur', () => saveRowData(tr));
    });
});

function saveRowData(tr) {
    // 获取用户输入的值
    const data = {
        server: tr.children[0].children[0].value.trim(),
        protocol: tr.children[1].children[0].value,
        url: tr.children[2].children[0].value.trim(),
        username: tr.children[3].children[0].value.trim(),
        password: tr.children[4].children[0].value.trim(),
    };

    // 校验必填字段
    if (!data.server || !data.url || !data.password) {
        alert('服务器、访问地址和密码不能为空！');
        return;
    }

    // 调用后端接口保存数据
    ipcRenderer.send('add-credential', data);
}

ipcRenderer.on('credential-added', () => {
    loadCredentials(); // 重新加载表格数据
});


document.getElementById('deleteRows').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
        alert('请选择需要删除的记录！');
        return;
    }
    if (!confirm('确定要删除选中的记录吗？')) return;

    const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
    ipcRenderer.send('delete-credentials', ids);
});

ipcRenderer.on('credentials-deleted', () => {
    loadCredentials();
});

document.getElementById('queryRows').addEventListener('click', () => {
    const server = document.getElementById('queryServer').value;
    const protocol = document.getElementById('queryProtocol').value;
    ipcRenderer.send('query-credentials', { server, protocol });
});

ipcRenderer.on('query-result', (event, rows) => {
    renderTable(rows);
});

document.getElementById('resetRows').addEventListener('click', () => {
    document.getElementById('queryServer').value = '';
    document.getElementById('queryProtocol').value = '';
    loadCredentials();
});

// 全选复选框逻辑
document.getElementById('selectAllCheckbox').addEventListener('change', (event) => {
    const checkboxes = document.querySelectorAll('#passwordTable tbody input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = event.target.checked;
    });
});

// 更新全选状态
function updateSelectAllCheckbox() {
    const checkboxes = document.querySelectorAll('#passwordTable tbody input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    selectAllCheckbox.checked = allChecked;
}