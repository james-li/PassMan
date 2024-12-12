const sqlite3 = require('sqlite3').verbose();
// const crypto = require('crypto-js');
const crypto = require('crypto');
let db = null;

function connectDatabase(filePath) {
    if (db != null) {
        db.close((err) => {
            if (err) {
                console.error('关闭数据库失败:', err.message);
            }
        });
    }
    db = new sqlite3.Database(filePath, (err) => {
        if (err) throw err;
        console.log("Connected to database %s", filePath);
    });
}

function initializeTables() {
    const keyTableSQL = `
        CREATE TABLE IF NOT EXISTS encrypt_keys
        (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            hash_key TEXT NOT NULL
        );
    `;
    const credentialTableSQL = `
        CREATE TABLE IF NOT EXISTS credentials
        (
            id         INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            server     TEXT    NOT NULL,
            protocol   TEXT    NOT NULL DEFAULT 'www',
            url        TEXT    NOT NULL,
            username   TEXT,
            password   TEXT,
            create_at  DATETIME         DEFAULT CURRENT_TIMESTAMP,
            update_at  DATETIME         DEFAULT CURRENT_TIMESTAMP
        );
    `;
    db.run(keyTableSQL);
    db.run(credentialTableSQL);
}


function getDistinctProtocols(callback) {
    const query = `SELECT DISTINCT protocol
                   FROM credentials`;
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
        SELECT id
        FROM encrypt_keys
        WHERE hash_key = ?
        LIMIT 1
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
        SELECT *
        FROM credentials
        WHERE project_id = ?
        ORDER BY create_at DESC
    `;
    db.all(query, [projectId], (err, rows) => {
        if (err) throw err;
        callback(rows);
    });
}

function createEncryptionKey(keyHashed, callback) {
    const insertSQL = `INSERT INTO encrypt_keys (hash_key)
                       VALUES (?)`;
    db.run(insertSQL, [keyHashed], function (err) {
        if (err) throw err;
        callback(this.lastID, null);
    });
}

// 查询数据（db.get）
function get(query, params = [], callback) {
    db.get(query, params, (err, row) => {
        if (err) {
            console.error('查询失败:', err.message);
            callback(err, null);
        } else {
            callback(null, row);
        }
    });
}

// 执行非查询操作（db.run）
function run(query, params = [], callback) {
    db.run(query, params, function (err) {
        if (err) {
            console.error('执行操作失败:', err.message);
            callback(err);
        } else {
            callback(null, this); // `this` 包含 lastID 和 changes
        }
    });
}

// 查询多行数据（db.all）
function all(query, params = [], callback) {
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('查询失败:', err.message);
            callback(err, null);
        } else {
            callback(null, rows);
        }
    });
}


module.exports = {
    get,
    run,
    all,
    connectDatabase,
    initializeTables,
    createEncryptionKey,
    getDistinctProtocols,
    validateEncryptionKey,
    loadCredentialsByProject
};
