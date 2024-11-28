const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const db = require('./db.js');

let mainWindow;
let encryptionKey = null;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.loadFile('index.html');
    db.connectDatabase('./default.db');
    db.initializeTables();
}

ipcMain.handle('load-database', async () => {
    const { filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] });
    if (filePaths.length === 0) return null;
    return filePaths[0];
});

ipcMain.handle('load-credentials', async (event) => {
    return new Promise((resolve, reject) => {
        // 检查全局密钥是否已设置
        if (!encryptionKey) {
            return reject('加密密钥未设置，请输入加密密钥！');
        }

        // 验证加密密钥并加载数据
        db.validateEncryptionKey(encryptionKey, (projectId, error) => {
            if (error) {
                encryptionKey = null; // 清空无效密钥
                return reject(error); // 验证失败
            }

            // 加载 project_id 对应的记录
            db.loadCredentialsByProject(projectId, (rows) => {
                resolve({ projectId, credentials: rows });
            });
        });
    });
});

ipcMain.handle('set-encryption-key', async (event, userKey) => {
    return new Promise((resolve, reject) => {
        db.validateEncryptionKey(userKey, (projectId, error) => {
            if (error) {
                return reject(error); // 验证失败
            }

            encryptionKey = userKey; // 设置全局加密密钥
            resolve(projectId); // 返回 project_id
        });
    });
});


ipcMain.on('add-credential', (event, data) => {
    if (!encryptionKey) throw new Error("Encryption key is missing");
    db.addCredential(data, encryptionKey, () => {
        event.reply('credential-added');
    });
});

ipcMain.on('delete-credentials', (event, ids) => {
    db.deleteCredentials(ids, () => {
        event.reply('credentials-deleted');
    });
});

ipcMain.on('query-credentials', (event, filter) => {
    db.queryCredentials(filter, (rows) => {
        event.reply('query-result', rows);
    });
});


ipcMain.handle('get-protocols', async () => {
    return new Promise((resolve) => {
        const defaultProtocols = ['www', 'ssh', 'mysql'];
        db.getDistinctProtocols((protocols) => {
            // 使用 Set 合并默认协议集合和数据库查询的协议集合
            const mergedProtocols = Array.from(new Set([...protocols, ...defaultProtocols]));
            resolve(mergedProtocols);
        });
    });
});

ipcMain.handle('decrypt-password', async (event, id) => {
    return new Promise((resolve, reject) => {
        const query = `SELECT password FROM credentials WHERE id = ?`;
        db.get(query, [id], (err, row) => {
            if (err) return reject(err);

            try {
                const decryptedPassword = crypto.AES.decrypt(row.password, encryptionKey).toString(crypto.enc.Utf8);
                resolve(decryptedPassword);
            } catch (error) {
                reject('解密失败：' + error.message);
            }
        });
    });
});


app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
