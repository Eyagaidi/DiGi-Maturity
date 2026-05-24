const mysql = require('mysql2');

const connection = mysql.createConnection({
 host: 'db',
  user: 'root',      // Par défaut f'XAMPP
  password: '',      // Par défaut f'XAMPP fergha
  database: 'digimaturity' // Esm el base elli fil taswira mte3ek
});

connection.connect((err) => {
  if (err) {
    console.error('Erreur de connexion MySQL:', err);
    return;
  }
  console.log('✅ Connecté à la base MySQL digimaturity!');
});

module.exports = connection;