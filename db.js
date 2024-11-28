
const sqlite3 = require('sqlite3').verbose();
// const crypto = require('crypto-js');
const crypto = require('crypto');
let db = null;

function connectDatabase(filePath) {
    db = new sqlite3.Database(filePath, (err) => {
        if (err) throw err;
        console.log("Connected to database");
    });
}

function initializeTables() {
    const keyTableSQL = `
        CREATE TABLE IF NOT EXISTS encrypt_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash_key TEXT NOT NULL
        );
    `;
    const credentialTableSQL = `
        CREATE TABLE IF NOT EXISTS credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            server TEXT NOT NULL,
            protocol TEXT NOT NULL DEFAULT 'www',
            url TEXT NOT NULL,
            username TEXT,
            password TEXT,
            create_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `;
    db.run(keyTableSQL);
    db.run(credentialTableSQL);
}

function loadCredentials(callback) {
    db.all("SELECT * FROM credentials ORDER BY create_at DESC", [], (err, rows) => {
        if (err) throw err;
        callback(rows);
    });
}

function addCredential(data, encryptionKey, callback) {
    const encryptedPassword = crypto.AES.encrypt(data.password, encryptionKey).toString();
    const insertSQL = `
        INSERT INTO credentials (server, protocol, url, username, password) 
        VALUES (?, ?, ?, ?, ?)
    `;
    db.run(insertSQL, [data.server, data.protocol, data.url, data.username, encryptedPassword], (err) => {
        if (err) throw err;
        callback();
    });
}

function deleteCredentials(ids, callback) {
    const deleteSQL = `DELETE FROM credentials WHERE id IN (${ids.join(",")})`;
    db.run(deleteSQL, [], (err) => {
        if (err) throw err;
        callback();
    });
}

function queryCredentials(filter, callback) {
    const querySQL = `
        SELECT * FROM credentials 
        WHERE server LIKE ? AND protocol LIKE ?
    `;
    db.all(querySQL, [`%${filter.server}%`, `%${filter.protocol}%`], (err, rows) => {
        if (err) throw err;
        callback(rows);
    });
}

function getDistinctProtocols(callback) {
    const query = `SELECT DISTINCT protocol FROM credentials`;
    db.all(query, [], (err, rows) => {
        if (err) throw err;
        const protocols = rows.map(row => row.protocol);
        callback(protocols);
    });
}

function validateEncryptionKey(encryptionKey, callback) {
    // 计算用户输入的密钥的哈希值
    const inputHash = crypto.createHash('sha1').update(encryptionKey).digest('hex');

    // 查询 encrypt_keys 表中是否存在匹配的 hash_key
    const query = `
        SELECT id FROM encrypt_keys 
        WHERE hash_key = ? LIMIT 1
    `;
    db.get(query, [inputHash], (err, row) => {
        if (err) throw err;

        if (row) {
            // 如果找到匹配的 hash_key，返回对应的 project_id
            callback(row.id, null);
        } else {
            // 未找到匹配的记录，返回错误
            callback(null, '密钥验证失败');
        }
    });
}

function loadCredentialsByProject(projectId, callback) {
    const query = `
        SELECT * FROM credentials 
        WHERE project_id = ? ORDER BY create_at DESC
    `;
    db.all(query, [projectId], (err, rows) => {
        if (err) throw err;
        callback(rows);
    });
}

module.exports = {
    connectDatabase,
    initializeTables,
    loadCredentials,
    addCredential,
    deleteCredentials,
    queryCredentials,
    getDistinctProtocols,
    validateEncryptionKey,
    loadCredentialsByProject
};
