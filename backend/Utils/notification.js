const db = require('../db'); // أو الملف اللي فيه الاتصال بقاعدة البيانات

const addNotification = (type, content) => {
    const sql = `
        INSERT INTO notifications (type, content)
        VALUES (?, ?)
    `;

    db.query(sql, [type, content]);
};

module.exports = addNotification;