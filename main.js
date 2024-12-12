const {app, BrowserWindow, ipcMain, dialog} = require('electron');
const path = require('path');
const credentialDb = require('./db.js');
const hashCrypto = require('crypto');
const aesCrypto = require('crypto-js');
const fs = require('fs');


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


ipcMain.handle('load-database', async (filePath) => {
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



ipcMain.handle('export-to-csv', (event, rows) => {
    return new Promise(async (resolve, reject) => {
        try {
            // 调用 showSaveDialog 让用户选择保存路径
            const { canceled, filePath } = await dialog.showSaveDialog({
                title: '保存为 CSV 文件',
                defaultPath: 'export.csv', // 默认文件名
                filters: [
                    { name: 'CSV Files', extensions: ['csv'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            // 如果用户取消保存
            if (canceled) {
                return resolve(null);
            }
        
            
                // 定义标题头
            const headers = ['id', 'server', 'protocol', 'url', 'username', 'password'];

            // 过滤 rows，仅保留需要的字段
            const filteredRows = rows.map(row => ({
                id: row.id,
                server: row.server,
                protocol: row.protocol,
                url: row.url,
                username: row.username,
                password: row.password
            }));

            // 将标题头和数据合并为 CSV 内容
            const csvContent = [
                headers.join(','), // 添加标题行
                ...filteredRows.map(row => headers.map(header => row[header] || '').join(',')) // 按标题顺序排列数据
            ].join('\n');

            // 写入文件
            fs.writeFileSync(filePath, csvContent);

            resolve(filePath); // 返回文件路径
            
        } catch (err) {
            reject(`导出 CSV 失败: ${err.message}`);
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
            const mergedProtocols = Array.from(new Set(['all', ...protocols, ...defaultProtocols]));
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


/*ipcMain.handle('save-credentials', async (event, rows) => {
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
});*/

ipcMain.handle('save-credentials', async (event, rows) => {
    return new Promise((resolve, reject) => {
        const insertOrUpdateSQL = `
            INSERT INTO credentials (id, project_id, server, protocol, url, username, password, create_at, update_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                project_id = excluded.project_id,
                server = excluded.server,
                protocol = excluded.protocol,
                url = excluded.url,
                username = excluded.username,
                password = excluded.password,
                update_at = CURRENT_TIMESTAMP
        `;

        const insertPromises = rows.map(row => {
            return new Promise((res, rej) => {
                // 加密密码
                const encryptedPassword = aesCrypto.AES.encrypt(row.password, encryptionKey).toString();
                credentialDb.run(
                    insertOrUpdateSQL,
                    [
                        row.id,                     // id
                        projectId,                  // project_id
                        row.server,                 // server
                        row.protocol,               // protocol
                        row.url,                    // url
                        row.username,               // username
                        encryptedPassword          // encrypted password
                    ],
                    (err) => {
                        if (err) return rej(err);
                        res();
                    }
                );
            });
        });

        Promise.all(insertPromises)
            .then(() => {
                changed = false; // 保存成功后重置 changed 状态
                resolve();
            })
            .catch(err => reject('保存数据失败：' + err.message));
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

