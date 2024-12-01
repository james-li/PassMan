const {app, BrowserWindow, ipcMain, dialog} = require('electron');
const path = require('path');
const credentialDb = require('./db.js');
const hashCrypto = require('crypto');
const aesCrypto = require('crypto-js');

let mainWindow;
let encryptionKey = null;
let projectId = null
let changed = false;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
        },
    });


    mainWindow.loadFile('index.html');
    credentialDb.connectDatabase('./default.db');
    credentialDb.initializeTables();
    mainWindow.on('close', (event) => {
        if (changed) {
            event.preventDefault(); // 取消退出
            const choice = require('electron').dialog.showMessageBoxSync({
                type: 'question',
                buttons: ['Yes', 'No'],
                defaultId: 0,
                title: '确认',
                message: '您有未保存的更改，是否保存？'
            });
            if (choice === 0) {

            } else if (choice === 1) {
                changed = false;
                app.quit();
            }
        }
    });
}


ipcMain.handle('load-database', async () => {
    return new Promise(async (resolve, reject) => {
        try {
            const {filePaths} = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [{name: 'SQLite Database', extensions: ['sqlite3', 'db', 'sqlite']}]
            });
            if (filePaths && filePaths.length > 0) {
                credentialDb.connectDatabase(filePaths[0]);
                resolve(filePaths[0]);
            } else {
                resolve(null);
            }
        } catch (err) {
            reject(err);
        }

    });
});

ipcMain.handle('check-encrypt-keys', async () => {
    return new Promise((resolve, reject) => {
        const query = `SELECT COUNT(*) AS count
                       FROM encrypt_keys`;

        credentialDb.get(query, [], (err, row) => {
            if (err) {
                console.error('查询 encrypt_keys 表失败:', err.message);
                return reject(err);
            }

            // 如果 count > 0，返回 true；否则返回 false
            resolve(row.count > 0);
        });
    });
});


/*ipcMain.handle('set-encryption-key', async (event, userKey) => {
    return new Promise((resolve, reject) => {
        credentialDb.validateEncryptionKey(userKey, (projectId, error) => {
            if (error) {
                return reject(error); // 验证失败
            }

            encryptionKey = userKey; // 设置全局加密密钥
            resolve(projectId); // 返回 project_id
        });
    });
});*/


ipcMain.handle('check-encryption-key', async (event, userKey) => {
    return new Promise((resolve, reject) => {
        const checkEmptyQuery = `SELECT COUNT(*) AS count
                                 FROM encrypt_keys`;
        credentialDb.get(checkEmptyQuery, [], (err, row) => {
            if (err) return reject(err);

            if (row.count === 0) {
                // 如果表为空，保存新密钥
                const inputHash = hashCrypto.createHash('sha1').update(userKey).digest('hex');
                credentialDb.createEncryptionKey(inputHash, (lastID, error) => {
                    if (error) return reject(error);
                    console.log("创建项目密钥成功，项目id为：", lastID);
                    encryptionKey = userKey; // 设置全局密钥
                    projectId = lastID; // 保存新插入记录的 ID
                    resolve(projectId);
                });
            } else {
                // 表不为空，验证密钥
                credentialDb.validateEncryptionKey(userKey, (lastId, error) => {
                    if (error) {
                        return reject(error); // 验证失败
                    }
                    encryptionKey = userKey; // 设置全局密钥
                    projectId = lastId;
                    resolve(projectId);
                });
            }
        });
    });
});

ipcMain.handle('reset-encryption-key', async (event, userKey) => {
    return new Promise((resolve, reject) => {
        if (projectId == null) {
            reject("Credentials are not load");
        }
        encryptionKey = userKey;
        const hashedKey = hashCrypto.createHash('sha1').update(userKey).digest('hex');
        const updateSql = `insert
        or replace into encrypt_keys(id, hash_key) values(?, ?)`;
        credentialDb.run(updateSql, [projectId, hashedKey], function (err) {
            if (err) return reject(err);
            resolve(projectId);
        });
    });
});


ipcMain.handle('load-credentials', async () => {
    return new Promise((resolve, reject) => {
        if (!encryptionKey || !projectId) {
            return reject('加密密钥未设置或 projectId 为空，请重新输入加密密钥！');
        }

        // 加载 projectId 对应的记录
        credentialDb.loadCredentialsByProject(projectId, (rows) => {
            const decryptedRows = rows.map((row) => {
                try {
                    // 使用加密密钥解密密码
                    const decryptedPassword = aesCrypto.AES.decrypt(row.password, encryptionKey).toString(aesCrypto.enc.Utf8);
                    return {...row, password: decryptedPassword}; // 更新解密后的 password
                } catch (error) {
                    console.error('解密失败:', error.message);
                    return {...row, password: ''}; // 处理解密失败的情况
                }
            });
            resolve(decryptedRows);
        });
    });
});


ipcMain.handle('get-protocols', async () => {
    return new Promise((resolve) => {
        const defaultProtocols = ['www', 'ssh', 'mysql'];
        credentialDb.getDistinctProtocols((protocols) => {
            // 使用 Set 合并默认协议集合和数据库查询的协议集合
            const mergedProtocols = Array.from(new Set([...protocols, ...defaultProtocols]));
            resolve(mergedProtocols);
        });
    });
});

ipcMain.handle('decrypt-password', async (event, encryptedPassword) => {
    return new Promise((resolve, reject) => {
        try {
            const decryptedPassword = aesCrypto.AES.decrypt(encryptedPassword, encryptionKey).toString(aesCrypto.enc.Utf8);
            resolve(decryptedPassword);
        } catch (error) {
            reject('解密失败：' + error.message);
        }
    });
});


ipcMain.handle('save-credentials', async (event, rows) => {
    return new Promise((resolve, reject) => {
        const deleteSQL = `DELETE
                           FROM credentials
                           WHERE project_id = ?`;
        const insertSQL = `
            INSERT INTO credentials (id, project_id, server, protocol, url, username, password, create_at, update_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        credentialDb.run(deleteSQL, [projectId], (err) => {
            if (err) return reject('清空旧数据失败：' + err.message);

            const insertPromises = rows.map(row => {
                return new Promise((res, rej) => {
                    const encryptedPassword = aesCrypto.AES.encrypt(row.password, encryptionKey).toString();
                    credentialDb.run(insertSQL, [row.id, projectId, row.server, row.protocol, row.url, row.username, encryptedPassword, row.create_at, row.update_at], (err) => {
                        if (err) return rej(err);
                        res();
                    });
                });
            });

            Promise.all(insertPromises)
                .then(() => {
                    changed = false;
                    resolve()
                })
                .catch(err => reject('插入数据失败：' + err.message));
        });
    });
});

ipcMain.on("set-changed", () => {
    console.log("data changed");
    changed = true;
});

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

