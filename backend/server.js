const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt'); 
const app = express();
const multer = require('multer');   // ← زيد هنا
const path = require('path');        // ← زيد هنا
const fs = require('fs');
// ✅ Config multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `user_${req.userId}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Fichier non supporté'), false);
    }
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// 1. Configuration CORS
app.use(cors({
   origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// ✅ 3. Middleware de vérification du Token (Version Corrigée)
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(403).json({ Error: "Token manquant" });
    }
    const parts = authHeader.split(" ");

    if (parts.length !== 2) {
        return res.status(403).json({ Error: "Format token invalide" });
    }
    const token = parts[1];
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            console.log("JWT Error:", err.message);
            return res.status(401).json({ Error: "Token invalide" });
        }
        req.userId = decoded.id;
        next();
    });
};
// ✅ Zid hethi bech n-riglou el 404
app.get('/me', verifyToken, (req, res) => {
    const sql = "SELECT * FROM utilisateur WHERE Id = ?";
    db.query(sql, [req.userId], (err, data) => {
        if (err) return res.status(500).json({ Error: "Erreur serveur" });
        if (data.length === 0) return res.status(404).json({ Error: "User non trouvé" });
        return res.json({ User: data[0] });
    });
});
// 2. Connexion à la base de données
const db = mysql.createPool({ 
    host:"127.0.0.1",
user: "root",
password: "",
database: "digimaturity",
        connectionLimit: 10,
         acquireTimeout: 30000, 
         timeout: 60000 });

db.getConnection((err, connection) => {
    if (err) {
        console.error("❌ ERREUR MY-SQL:", err.code);
        return;
    }
    console.log("✅ Connexion MySQL réussie !");
    connection.release();
});

const SECRET_KEY = "ton_secret_key_pfe_2024";



// ✅ 4. Config Mailer corrigée pour l'erreur de certificat
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, 
    auth: {
        user: 'digimaturity@gmail.com', 
        pass: 'cepf zjwc nzxe mpvt' 
    },
    tls: {
        // ✅ Hedhi hya elli bech t-na77i el erreur "self-signed certificate"
        rejectUnauthorized: false
    }
});
// ========================================
// register + login
// =======================================
// ✅ Route Register Corrigée
// ✅ Route Register Corrigée
app.post('/register', (req, res) => {
    const { nom, email, password, role, telephone, adresse } = req.body;

    const checkEmailSql = "SELECT * FROM utilisateur WHERE Email = ?";
    db.query(checkEmailSql, [email], (err, data) => {
        if (err) return res.status(500).json({ Error: "Erreur serveur lors de la vérification" });
        
        if (data.length > 0) {
            return res.status(400).json({ Error: "Ce compte est déjà utilisé" });
        }

        bcrypt.hash(password.toString().trim(), 10, (err, hash) => {
            if (err) return res.status(500).json({ Error: "Erreur hashing" });

            const sql = "INSERT INTO utilisateur (Nom, Email, MotDePass, Role, Telephone, Adresse) VALUES (?, ?, ?, ?, ?, ?)";
            const values = [nom, email, hash, role, telephone, adresse];

            db.query(sql, values, (err, result) => {
                if (err) return res.status(500).json({ Error: err.message });

                const token = jwt.sign(
                    { id: result.insertId, role: role },
                    SECRET_KEY,
                    { expiresIn: '1d' }
                );

                // ✅ NOTIFICATION avec role_target = 'admin'
                const notifSql = "INSERT INTO notifications (role_target, type, content) VALUES ('admin', 'user', ?)";
                db.query(notifSql, [`Nouvel utilisateur: ${nom} (${role})`]);

                sendNotification(
                    "Nouveau Compte Créé - DiGi-Maturity", 
                    `Un nouvel utilisateur a été ajouté au système : <br><br>
                     <b>Nom:</b> ${nom} <br>
                     <b>Rôle:</b> ${role} <br>
                     <b>Email:</b> ${email} <br>
                     <b>Téléphone:</b> ${telephone}`
                );

                return res.json({
                    Status: "Success",
                    Token: token,
                    Role: role,
                    Nom: nom
                });
            });
        });
    });
});
// les notifications :

/// ✅ GET notifications par role
app.get('/api/notifications', (req, res) => {
    const role = req.query.role;

    const sql = `
        SELECT * FROM notifications
        WHERE role_target = ? OR role_target = 'all'
        ORDER BY created_at DESC
    `;

    db.query(sql, [role], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json(data);
    });
});

// ✅ Marquer toutes comme lues par role
// Marquer un TYPE spécifique comme lu
app.put('/api/notifications/read-type', (req, res) => {
    const { role, type } = req.query;
    const sql = `
        UPDATE notifications
        SET is_read = 1
        WHERE (role_target = ? OR role_target = 'all')
          AND type = ?
    `;
    db.query(sql, [role, type], (err) => {
        if (err) return res.status(500).json(err);
        return res.json({ Status: "Success" });
    });
});

// ✅ AJOUTE CETTE ROUTE — elle manquait
app.put('/api/notifications/read', (req, res) => {
    const role = req.query.role;
    console.log("📌 markAllRead role:", role);
    const sql = `
        UPDATE notifications 
        SET is_read = 1
        WHERE role_target = ? OR role_target = 'all'
    `;
    db.query(sql, [role], (err) => {
        if (err) return res.status(500).json(err);
        return res.json({ Status: "Success" });
    });
});

// ✅ Marquer une seule comme lue
app.put('/api/notifications/:id/read', (req, res) => {
    const sql = "UPDATE notifications SET is_read = TRUE WHERE id = ?";
    db.query(sql, [req.params.id], (err) => {
        if (err) return res.status(500).json(err);
        return res.json({ Status: "Success" });
    });
});

// ✅ Supprimer toutes les notifications
app.delete('/api/notifications/clear', (req, res) => {
    db.query("DELETE FROM notifications", (err) => {
        if (err) return res.status(500).json(err);
        return res.json({ Status: "Cleared" });
    });
});
// notification  sur l'email de nouveau utilisateur
const sendNotification = (sujet, message) => {
    const mailOptions = {
        from: 'DiGi-Maturity <digimaturity@gmail.com>',
        to: 'digimaturity@gmail.com', // C'est ici que tu reçois tout
        subject: sujet,
        html: `<div style="font-family: sans-serif; border: 1px solid #ddd; padding: 20px;">
                <h2 style="color: #00d4ff;">DiGi-Maturity Notification</h2>
                <p>${message}</p>
               </div>`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) console.log("❌ Erreur Mail:", error);
        else console.log("📧 Email envoyé: " + sujet);
    });
};
// blockage 15 min

const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    
    // ✅ Block بـ IP فقط = الـ machine كاملة تتبلوك
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    },
    
    message: { 
        Error: "Trop de tentatives. Réessayez dans 15 minutes." 
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Route Login
app.post('/login', loginLimiter, (req, res) => {
    const sql = "SELECT * FROM utilisateur WHERE Email = ? ORDER BY Id DESC LIMIT 1";
    
    db.query(sql, [req.body.email], async (err, data) => {
        if (err) return res.status(500).json({ Error: "Erreur serveur" });

        if (data.length > 0) {
            // ✅ Logs de debug
            console.log("📧 Email trouvé:", data[0].Email);
            console.log("🔑 Password reçu:", req.body.password);
            console.log("🔐 Hash en base:", data[0].MotDePass);
            console.log("📏 Hash commence par $2b$:", data[0].MotDePass?.startsWith('$2b$'));

            const match = await bcrypt.compare(
                req.body.password.toString().trim(),
                data[0].MotDePass.toString().trim()
            );

            console.log("✅ Match result:", match);

            if (match) {
                const token = jwt.sign(
                    { id: data[0].Id, role: data[0].Role },
                    SECRET_KEY,
                    { expiresIn: '1d' }
                );
                return res.json({
                    Status: "Success",
                    Token: token,
                    Role: data[0].Role,
                    Nom: data[0].Nom
                });
            } else {
                return res.status(401).json({ Error: "Mot de passe incorrect" });
            }
        } else {
            return res.status(404).json({ Error: "Utilisateur non trouvé" });
        }
    });
});
// ==================================
// routes mot de passe oublier
// ==================================

// Route Mot de passe oublié 
app.post('/api/forgot-password', (req, res) => {
    const { email } = req.body;

    // 1️⃣ Vérifier si l'utilisateur existe
    const checkUserSql = "SELECT * FROM utilisateur WHERE Email = ?";
    db.query(checkUserSql, [email], (err, data) => {
        if (err) return res.status(500).json({ Error: "Erreur SQL" });
        if (data.length === 0) return res.status(404).json({ Error: "Cet email n'existe pas" });

        const user = data[0];
        const now = new Date();

        // 2️⃣ Vérifier si bloqué
        if (user.bloque_jusqu_a && new Date(user.bloque_jusqu_a) > now) {
            const minutesRestantes = Math.ceil((new Date(user.bloque_jusqu_a) - now) / 60000);
            return res.status(429).json({
                Error: `Trop de tentatives. Réessayez dans ${minutesRestantes} minute(s).`,
                bloque: true,
                minutesRestantes
            });
        }

        // 3️⃣ Vérifier cooldown
        if (user.derniere_demande) {
            const secondesEcoulees = (now - new Date(user.derniere_demande)) / 1000;
            if (secondesEcoulees < 120) {

                // ⚠️ Incrémenter les tentatives même pendant le cooldown
                let tentativesCooldown = (user.tentatives_reset || 0) + 1;

                if (tentativesCooldown >= 5) {
                    const bloqueJusqua = new Date(now.getTime() + 60 * 60000);
                    db.query(
                        "UPDATE utilisateur SET tentatives_reset = 0, bloque_jusqu_a = ? WHERE Email = ?",
                        [bloqueJusqua, email]
                    );
                    return res.status(429).json({
                        Error: "Trop de tentatives. Compte bloqué pendant 1 heure.",
                        bloque: true,
                        minutesRestantes: 60
                    });
                }

                db.query(
                    "UPDATE utilisateur SET tentatives_reset = ? WHERE Email = ?",
                    [tentativesCooldown, email]
                );

                const secondesRestantes = Math.ceil(120 - secondesEcoulees);
                return res.status(429).json({
                    Error: `Veuillez attendre avant de réessayer.`,
                    cooldown: true,
                    secondesRestantes
                });
            }
        }

        // 4️⃣ Calculer les tentatives
        let tentatives = (user.tentatives_reset || 0) + 1;

        // 5️⃣ Bloquer si >= 5 tentatives
        if (tentatives >= 5) {
            const bloqueJusqua = new Date(now.getTime() + 60 * 60000);
            db.query(
                "UPDATE utilisateur SET tentatives_reset = 0, bloque_jusqu_a = ?, derniere_demande = ? WHERE Email = ?",
                [bloqueJusqua, now, email]
            );
            return res.status(429).json({
                Error: "Trop de tentatives. Compte bloqué pendant 1 heure.",
                bloque: true,
                minutesRestantes: 60
            });
        }

        // 6️⃣ Générer le code + expiration 15 min
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiration = new Date(now.getTime() + 15 * 60000);

        const updateSql = `
            UPDATE utilisateur 
            SET code = ?, 
                code_expiration = ?, 
                tentatives_reset = ?, 
                bloque_jusqu_a = NULL,
                derniere_demande = ?,
                tentatives_verification = 0
            WHERE Email = ?
        `;

        db.query(updateSql, [code, expiration, tentatives, now, email], (err) => {
            if (err) return res.status(500).json({ Error: "Erreur mise à jour" });

            const mailOptions = {
                from: 'digimaturity@gmail.com',
                to: email,
                subject: 'Code de sécurité DigiMaturity',
                html: `
                    <h2>Code de réinitialisation</h2>
                    <p>Votre code est : <strong style="font-size:24px">${code}</strong></p>
                    <p>Ce code expire dans <strong>15 minutes</strong>.</p>
                    <p style="color:gray">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
                `
            };

            transporter.sendMail(mailOptions, (error) => {
                if (error) {
                    console.error("❌ Nodemailer Error:", error.message);
                    return res.status(500).json({ Error: "Erreur d'envoi du mail" });
                }

                return res.json({
                    Status: "Success",
                    tentativesRestantes: 5 - tentatives
                });
            });
        });
    });
});
// Route Verification Code
app.post('/api/verify-code', (req, res) => {
    const { email, code } = req.body;

    const sql = "SELECT * FROM utilisateur WHERE Email = ?";
    db.query(sql, [email], (err, result) => {
        if (err) return res.status(500).json({ Error: "Erreur SQL" });
        if (result.length === 0) return res.status(404).json({ Error: "Utilisateur introuvable" });

        const user = result[0];
        const now = new Date();

        // 1️⃣ Code expiré ? → on reset le code en base
      // 1️⃣ Code expiré ? → Comparaison correcte en UTC
const maintenant = new Date();
const expiration = user.code_expiration ? new Date(user.code_expiration) : null;

console.log("🕐 Maintenant     :", maintenant.toISOString());
console.log("⏰ Expiration     :", expiration ? expiration.toISOString() : "NULL");
console.log("✅ Code en base   :", user.code);
console.log("📥 Code reçu      :", code);

if (!expiration || maintenant > expiration) {
    db.query(
        "UPDATE utilisateur SET code = NULL, code_expiration = NULL, tentatives_verification = 0 WHERE Email = ?",
        [email]
    );
    return res.status(400).json({ 
        Error: "Ce code a expiré. Veuillez demander un nouveau code.",
        expire: true
    });
}

        // 2️⃣ Trop de tentatives ?
        if (user.tentatives_verification >= 5) {
            return res.status(429).json({ 
                Error: "Trop de tentatives incorrectes. Demandez un nouveau code.",
                bloque: true
            });
        }

        // 3️⃣ Code incorrect ?
        if (user.code !== code) {
            const nouvellesTentatives = (user.tentatives_verification || 0) + 1;
            db.query(
                "UPDATE utilisateur SET tentatives_verification = ? WHERE Email = ?",
                [nouvellesTentatives, email]
            );
            return res.status(400).json({
                Error: "Code incorrect.",
                tentativesRestantes: 5 - nouvellesTentatives
            });
        }

        // 4️⃣ Code correct ✅
        return res.json({ Status: "Success" });
    });
});

// Route nouveau Password
app.post('/api/reset-password', (req, res) => {
    const { email, password } = req.body;

    
    console.log("📥 email reçu    :", email);
    console.log("📥 password reçu :", password);
    console.log("📥 regex test    :", /^.{8,}$/.test(password));

    // 🔒 Validation côté serveur aussi (sécurité double)
    const regexMotDePasse = /^.{8,}$/;
    if (!regexMotDePasse.test(password)) {
        return res.status(400).json({ Error: "Mot de passe trop faible." });
    }

   bcrypt.hash(password.toString(), 10, (err, hash) => {
    console.log("🔐 bcrypt err:", err);
    console.log("🔐 bcrypt hash:", hash);
    if (err) return res.status(500).json({ Error: "Erreur cryptage" });
        
        // ✅ Reset tout proprement après changement réussi
        const sql = `
            UPDATE utilisateur 
            SET MotDePass = ?, 
                code = NULL, 
                code_expiration = NULL,
                tentatives_reset = 0,
                bloque_jusqu_a = NULL,
                derniere_demande = NULL,
                tentatives_verification = 0
            WHERE Email = ?
        `;
        db.query(sql, [hash, email], (err, result) => {
    console.log("🗄️ SQL err:", err);
    console.log("🗄️ SQL result:", result);
    if (err) {
        console.log("❌ Erreur SQL reset:", err.message);
        return res.status(500).json({ Error: "Erreur SQL" });
    }
    return res.json({ Status: "Success" });
});
    });
});
// ================================
// route segmentation
// ================================
// utils/notification.js


const addNotification = (role_target, type, content) => {
    const sql = "INSERT INTO notifications (role_target, type, content) VALUES (?, ?, ?)";
    db.query(sql, [role_target, type, content], (err) => {
        if (err) console.error("Notification error:", err);
    });
};

module.exports = addNotification;
// ✅ Route segmentation-detail
app.post('/api/audit/segmentation-detail', verifyToken, (req, res) => {
    const userId = req.userId;
    const {
        entreprise_nom,
        effectif_range,
        secteur,
        besoin,
        comprehension_manager,
        zone_geo,
        dateAudit,
        force  // ✅ true quand ça vient du bouton "Refaire le test"
    } = req.body;
 
    // Validation
    if (
        !entreprise_nom || entreprise_nom.trim() === "" ||
        !effectif_range ||
        !secteur        || secteur.trim() === ""        ||
        !besoin         || besoin.trim() === ""          ||
        !comprehension_manager                           ||
        !zone_geo                                        ||
        !dateAudit
    ) {
        return res.status(400).json({ Status: "Error", Message: "Tous les champs sont obligatoires" });
    }
 
    const sqlCheck = `
        SELECT idAudit, created_at
        FROM audit_detail
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
    `;
 
    db.query(sqlCheck, [userId], (err, result) => {
        if (err) return res.status(500).json({ Error: "Erreur SQL" });
 
        if (result.length > 0) {
            const createdAt = new Date(result[0].created_at);
            const diffHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
 
            console.log("⏰ Heures depuis segmentation:", diffHours.toFixed(2), "| force:", force);
 
            // ❌ Moins de 24h ET pas de force → bloqué
            if (diffHours < 24 && !force) {
                const heuresRestantes = Math.ceil(24 - diffHours);
                return res.status(400).json({
                    Error: `Vous ne pouvez pas refaire la segmentation avant ${heuresRestantes}h.`,
                    canRetry: false,
                    heuresRestantes
                });
            }
 
            // ✅ force=true (refaire test) OU plus de 24h → migrer + insérer
            if (diffHours >= 24) {
                // Migrer l'ancien vers audit
                const sqlMove = `
                    INSERT INTO audit
                        (user_id, entreprise_nom, effectif_range, secteur, besoin,
                         comprehension_manager, zone_geo, dateAudit, segment)
                    SELECT user_id, entreprise_nom, effectif_range, secteur, besoin,
                           comprehension_manager, zone_geo, dateAudit, segment
                    FROM audit_detail WHERE user_id = ?
                `;
                db.query(sqlMove, [userId], (errMove) => {
                    if (errMove) return res.status(500).json({ Error: "Erreur migration" });
                    db.query("DELETE FROM audit_detail WHERE user_id = ?", [userId], (errDel) => {
                        if (errDel) return res.status(500).json({ Error: "Erreur suppression" });
                        insertNewSegmentation();
                    });
                });
                return;
            }
 
            // force=true + moins 24h → on garde la segmentation existante,
            // on va juste au chatbot directement
            if (force) {
                console.log("🔁 Force=true — segmentation gardée, on retourne le segment existant");
                // Récupère le segment actuel
                const sqlGetSegment = "SELECT segment FROM audit_detail WHERE user_id = ? ORDER BY created_at DESC LIMIT 1";
                db.query(sqlGetSegment, [userId], (errSeg, resSeg) => {
                    if (errSeg || resSeg.length === 0) {
                        return res.status(500).json({ Error: "Erreur récupération segment" });
                    }
                    return res.json({ Status: "Success", Segment: resSeg[0].segment });
                });
                return;
            }
        }
 
        // Aucune segmentation existante → INSERT direct
        insertNewSegmentation();
 
        function insertNewSegmentation() {
            let segment = "Micro-Digital";
            const b = besoin               ? besoin.toLowerCase()               : "";
            const s = secteur              ? secteur.trim()                     : "";
            const m = comprehension_manager ? comprehension_manager.toLowerCase() : "";
 
            if (s.includes("Commerce") || s.includes("Vente") || b.includes("boutique")) {
                segment = "E-commerce";
            } else if (effectif_range === "+501" && (m.includes("élevé") || m.includes("eleve"))) {
                segment = "Leader Digital";
            } else if (effectif_range === "+501") {
                segment = "Grand Compte Traditionnel";
            } else if ((s.includes("Informatique") || s.includes("Télécom")) && m.includes("élevé")) {
                segment = "Digital Native";
            } else if (effectif_range === "101-500") {
                segment = "PME en Transition";
            }
 
            const sqlInsert = `
                INSERT INTO audit_detail
                    (user_id, entreprise_nom, effectif_range, secteur, besoin,
                     comprehension_manager, zone_geo, dateAudit, segment)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            db.query(sqlInsert,
                [userId, entreprise_nom, effectif_range, secteur, besoin,
                 comprehension_manager, zone_geo, dateAudit, segment],
                (errInsert) => {
                    if (errInsert) return res.status(500).json({ Error: "Erreur insertion" });
                    addNotification('analyst', 'selecteur',
                        `Nouvel audit créé pour ${entreprise_nom} — Segment: ${segment}`
                    );
                    return res.json({ Status: "Success", Segment: segment });
                }
            );
        }
    });
});
 

// ✅ Route modifier audit
app.put('/api/audit/modifier-detail/:idAudit', verifyToken, (req, res) => {
    const { idAudit } = req.params;
    const userId = req.userId;
    const { entreprise_nom, effectif_range, secteur, besoin, comprehension_manager, zone_geo, dateAudit } = req.body;

    if (!entreprise_nom?.trim() || !effectif_range || !secteur?.trim() || !besoin?.trim() || !comprehension_manager || !zone_geo || !dateAudit) {
        return res.status(400).json({ Error: "Veuillez remplir tous les champs obligatoires" });
    }

    const sqlCheck = `SELECT created_at, segment FROM audit_detail WHERE idAudit = ? AND user_id = ?`;

    db.query(sqlCheck, [idAudit, userId], (err, result) => {
        if (err) return res.status(500).json({ Error: "Erreur SQL" });
        if (result.length === 0) return res.status(404).json({ Error: "Audit non trouvé" });

        const createdAt = new Date(result[0].created_at);
        const oldSegment = result[0].segment;
        const diffHours = (new Date() - createdAt) / (1000 * 60 * 60);

        if (diffHours > 24) {
            return res.status(400).json({ Error: "Période de modification expirée." });
        }

        let segment = "Micro-Digital";
        const b = besoin ? besoin.toLowerCase() : "";
        const s = secteur ? secteur.trim() : "";
        const m = comprehension_manager ? comprehension_manager.toLowerCase() : "";

        if (s.includes("Commerce") || s.includes("Vente") || b.includes("boutique")) {
            segment = "E-commerce";
        } else if (effectif_range === "+501" && (m.includes("élevé") || m.includes("eleve"))) {
            segment = "Leader Digital";
        } else if (effectif_range === "+501") {
            segment = "Grand Compte Traditionnel";
        } else if ((s.includes("Informatique") || s.includes("Télécom")) && m.includes("élevé")) {
            segment = "Digital Native";
        } else if (effectif_range === "101-500") {
            segment = "PME en Transition";
        }

        const segmentChanged = oldSegment !== segment;

        const sqlUpdate = `
            UPDATE audit_detail 
            SET entreprise_nom=?, effectif_range=?, secteur=?, besoin=?, 
                comprehension_manager=?, zone_geo=?, dateAudit=?, segment=?
            WHERE idAudit=? AND user_id=?
        `;

        db.query(sqlUpdate, [entreprise_nom, effectif_range, secteur, besoin, comprehension_manager, zone_geo, dateAudit, segment, idAudit, userId], (err) => {
            if (err) return res.status(500).json({ Error: "Erreur modification" });

            // ✅ notification → analyste seulement
            if (segmentChanged) {
                addNotification('analyst', 'selecteur','diagnostic', 'agenda',`Segment modifié pour ${entreprise_nom} → ${segment}`);
            } else {
                addNotification('analyst', 'selecteur','diagnostic','agenda', `Audit modifié pour ${entreprise_nom}`);
            }

            return res.json({
                Status: "Success",
                segment: segment,
                segmentChanged: segmentChanged,
                forceChatbot: segmentChanged
            });
        });
    });
});

// ✅ Routes GET — inchangées
app.get('/api/check-audit', verifyToken, (req, res) => {
    const sql = "SELECT segment FROM audit WHERE user_id = ? LIMIT 1";
    db.query(sql, [req.userId], (err, result) => {
        if (err) return res.status(500).json({ Error: "Erreur SQL" });
        if (result.length > 0) {
            return res.json({ hasAudit: true, segment: result[0].segment });
        } else {
            return res.json({ hasAudit: false });
        }
    });
});

app.get('/api/audit/historique-detail', verifyToken, (req, res) => {
    const sql = "SELECT * FROM audit_detail WHERE user_id = ? ORDER BY dateAudit DESC";
    db.query(sql, [req.userId], (err, data) => {
        if (err) return res.status(500).json({ Error: "Erreur SQL" });
        return res.json(data);
    });
});



app.get('/api/analyste/all-audits', verifyToken, (req, res) => {
    const sql = `
        SELECT ad.idAudit, ad.user_id, ad.entreprise_nom, ad.effectif_range, ad.secteur,
            ad.besoin, ad.comprehension_manager, ad.zone_geo, ad.segment, ad.dateAudit,
            ad.created_at, 'audit_detail' as source, ad.archived, u.Nom as nom_user
        FROM audit_detail ad
        LEFT JOIN utilisateur u ON ad.user_id = u.Id
        UNION ALL
        SELECT a.idAudit, a.user_id, a.entreprise_nom, a.effectif_range, a.secteur,
            a.besoin, a.comprehension_manager, a.zone_geo, a.segment, a.dateAudit,
            a.dateAudit as created_at, 'audit' as source, a.archived, u.Nom as nom_user
        FROM audit a
        LEFT JOIN utilisateur u ON a.user_id = u.Id
        ORDER BY created_at DESC
    `;
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json({ Error: "Erreur récupération audits" });
        return res.json(data);
    });
});
// =================================
// les archives
// ==================================
// Archiver  table audit
app.put('/api/audit/archiver/:id', verifyToken, (req, res) => {
    const id = req.params.id;
    const sql = "UPDATE audit SET archived = TRUE WHERE idAudit = ?";
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ Error: err.message });
        return res.json({ Status: "Success" });
    });
});

// Désarchiver table audit
app.put('/api/audit/desarchiver/:id', verifyToken, (req, res) => {
    const id = req.params.id;
    const sql = "UPDATE audit SET archived = FALSE WHERE idAudit = ?";
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ Error: err.message });
        return res.json({ Status: "Success" });
    });
});

// Get audits archivés
app.get('/api/audit/archives', verifyToken, (req, res) => {
const sql = "SELECT * FROM audit WHERE archived = TRUE ORDER BY dateAudit DESC";  
db.query(sql, (err, data) => {
        if (err) return res.status(500).json({ Error: err.message });
        return res.json(data);
    });
});
// Archiver  table audit_detail
// Get audits_detail archivés
app.get('/api/audit-detail/archives', verifyToken, (req, res) => {

    const sql = `
        SELECT *
        FROM audit_detail
        WHERE archived = 1
        ORDER BY dateAudit DESC
    `;

    db.query(sql, (err, data) => {
        if (err) {
            return res.status(500).json({ Error: err.message });
        }

        return res.json(data);
    });
});
// Archiver audit_detail
app.put('/api/audit/archiver-old/:idAudit', verifyToken, (req, res) => {

    const { idAudit } = req.params;

    const sql = `
        UPDATE audit_detail
        SET archived = 1
        WHERE idAudit = ?
    `;

    db.query(sql, [idAudit], (err, result) => {

        if (err) {
            console.error(err);

            return res.status(500).json({
                Error: "Erreur archivage audit_detail"
            });
        }

        return res.json({
            Status: "Success"
        });
    });
});
// Désarchiver un audit dans la table audit_detail
app.put('/api/audit-detail/desarchiver/:idAudit', verifyToken, (req, res) => {
    const { idAudit } = req.params;
    
    // On remet 'archived' à 0 pour qu'il réapparaisse dans la liste principale
    const sql = "UPDATE audit_detail SET archived = 0 WHERE idAudit = ?";
    
    db.query(sql, [idAudit], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ Error: "Erreur lors du désarchivage" });
        }
        return res.json({ Status: "Success" });
    });
});
// Archiver diagnostic
app.put('/api/diagnostic/archiver/:id', verifyToken, (req, res) => {
    const id = req.params.id;
    const sql = "UPDATE reponse SET archived = TRUE WHERE idRep = ?";
    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json({ Error: err.message });
        return res.json({ Status: "Success" });
    });
});

// Désarchiver diagnostic
app.put('/api/diagnostic/desarchiver/:id', verifyToken, (req, res) => {
    const id = req.params.id;
    const sql = "UPDATE reponse SET archived = FALSE WHERE idRep = ?";
    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json({ Error: err.message });
        return res.json({ Status: "Success" });
    });
});

// Get diagnostics archivés
app.get('/api/diagnostics/archives', verifyToken, (req, res) => {
    // On utilise GROUP BY pour éviter les doublons par diagnostic
    const sql = `
        SELECT r.* FROM reponse r
        WHERE r.archived = TRUE
        GROUP BY r.idRep
        ORDER BY r.dateAudit DESC
    `;
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json({ Error: err.message });
        return res.json(data);
    });

});

// =============================
// routes profils
// ===============================

// ✅ Route profil entreprise
app.get('/api/user-audit-details', verifyToken, (req, res) => {
    const sql = `
        SELECT 
            u.Nom AS entreprise_nom_user,
            u.Email AS entreprise_email, 
            u.Telephone AS telephone_fix,
            u.Adresse AS adresse_fix,
            u.photo AS photo,
            COALESCE(a.entreprise_nom, ad.entreprise_nom, u.Nom) AS entreprise_nom,
            COALESCE(a.effectif_range, ad.effectif_range) AS effectif_range,
            COALESCE(a.secteur, ad.secteur) AS secteur,
            COALESCE(a.zone_geo, ad.zone_geo) AS zone_geo,
            COALESCE(a.segment, ad.segment) AS segment,
            COALESCE(a.dateAudit, ad.dateAudit) AS dateAudit
        FROM utilisateur u
        LEFT JOIN audit a ON u.Id = a.user_id
        LEFT JOIN audit_detail ad ON u.Id = ad.user_id
        WHERE u.Id = ? 
        ORDER BY COALESCE(a.dateAudit, ad.dateAudit) DESC 
        LIMIT 1`;

    db.query(sql, [req.userId], (err, data) => {
        if (err) return res.status(500).json({ Error: "Erreur SQL Profile" });
        if (data.length > 0) {
            return res.json(data[0]);
        } else {
            return res.status(404).json({ Error: "Utilisateur non trouvé" });
        }
    });
});
// Route pour mettre à jour le profil de l'entreprise
app.put('/api/update-user-profile', verifyToken, (req, res) => {
    const userId = req.userId;
    const updatedData = req.body;

    const fieldName = Object.keys(updatedData)[0];
    const newValue = Object.values(updatedData)[0];

    console.log("🔧 Update request:", { userId, fieldName, newValue });

    if (['entreprise_email', 'telephone_fix', 'adresse_fix'].includes(fieldName)) {
        const mapping = {
            'entreprise_email': 'Email',
            'telephone_fix': 'Telephone',
            'adresse_fix': 'Adresse'
        };
        const realColumn = mapping[fieldName];
        const sql = `UPDATE utilisateur SET ${realColumn} = ? WHERE Id = ?`;

        db.query(sql, [newValue, userId], (err, result) => {
            if (err) {
                console.error("❌ SQL Error:", err);
                return res.status(500).json({ Error: err.message });
            }
            console.log("✅ utilisateur updated, rows:", result.affectedRows);
            return res.json({ Status: "Success" });
        });

    } else if (fieldName === 'entreprise_nom') {

        // ✅ STEP 1: jib el ancien nom awwel
        const sqlGetOldNom = "SELECT Nom FROM utilisateur WHERE Id = ?";

        db.query(sqlGetOldNom, [userId], (err, result) => {
            if (err) return res.status(500).json({ Error: err.message });
            if (result.length === 0) return res.status(404).json({ Error: "User non trouvé" });

            const oldNom = result[0].Nom;
            console.log("🔄 Ancien nom:", oldNom, "→ Nouveau nom:", newValue);

            // ✅ STEP 2: update kol el tables en cascade
            const updates = [
                // 1. utilisateur.Nom
                new Promise((resolve, reject) => {
                    db.query(
                        "UPDATE utilisateur SET Nom = ? WHERE Id = ?",
                        [newValue, userId],
                        (err, r) => {
                            if (err) { console.error("❌ utilisateur:", err); return reject(err); }
                            console.log("✅ utilisateur.Nom updated:", r.affectedRows, "rows");
                            resolve();
                        }
                    );
                }),

                // 2. audit.entreprise_nom
                new Promise((resolve, reject) => {
                    db.query(
                        "UPDATE audit SET entreprise_nom = ? WHERE user_id = ?",
                        [newValue, userId],
                        (err, r) => {
                            if (err) { console.error("❌ audit:", err); return reject(err); }
                            console.log("✅ audit.entreprise_nom updated:", r.affectedRows, "rows");
                            resolve();
                        }
                    );
                }),

                // 3. audit_detail.entreprise_nom
                new Promise((resolve, reject) => {
                    db.query(
                        "UPDATE audit_detail SET entreprise_nom = ? WHERE user_id = ?",
                        [newValue, userId],
                        (err, r) => {
                            if (err) { console.error("❌ audit_detail:", err); return reject(err); }
                            console.log("✅ audit_detail.entreprise_nom updated:", r.affectedRows, "rows");
                            resolve();
                        }
                    );
                }),

                // 4. reponse.entrepriseNom (b l'ancien nom)
                new Promise((resolve, reject) => {
                    db.query(
                        "UPDATE reponse SET entrepriseNom = ? WHERE LOWER(entrepriseNom) = LOWER(?)",
                        [newValue, oldNom],
                        (err, r) => {
                            if (err) { console.error("❌ reponse:", err); return reject(err); }
                            console.log("✅ reponse.entrepriseNom updated:", r.affectedRows, "rows");
                            resolve();
                        }
                    );
                }),

                // 5. rendez_vous.entreprise_nom (b l'ancien nom)
                new Promise((resolve, reject) => {
                    db.query(
                        "UPDATE rendez_vous SET entreprise_nom = ? WHERE LOWER(entreprise_nom) = LOWER(?)",
                        [newValue, oldNom],
                        (err, r) => {
                            if (err) { console.error("❌ rendez_vous:", err); return reject(err); }
                            console.log("✅ rendez_vous.entreprise_nom updated:", r.affectedRows, "rows");
                            resolve();
                        }
                    );
                }),

                // 6. plans_action.entreprise_nom (b l'ancien nom)
                new Promise((resolve, reject) => {
                    db.query(
                        "UPDATE plans_action SET entreprise_nom = ? WHERE LOWER(entreprise_nom) = LOWER(?)",
                        [newValue, oldNom],
                        (err, r) => {
                            if (err) { console.error("❌ plans_action:", err); return reject(err); }
                            console.log("✅ plans_action.entreprise_nom updated:", r.affectedRows, "rows");
                            resolve();
                        }
                    );
                }),
            ];

            // ✅ STEP 3: execute kol el updates w respond
            Promise.all(updates)
                .then(() => {
                    console.log("🎉 Tous les noms mis à jour avec succès!");
                    return res.json({ 
                        Status: "Success", 
                        oldNom: oldNom,
                        newNom: newValue 
                    });
                })
                .catch((err) => {
                    console.error("❌ Erreur cascade update:", err);
                    return res.status(500).json({ Error: "Erreur mise à jour cascade: " + err.message });
                });
        });

    } else if (['secteur', 'zone_geo'].includes(fieldName)) {
        // secteur w zone_geo → audit w audit_detail bes
        Promise.all([
            new Promise((resolve, reject) => {
                db.query(
                    `UPDATE audit SET ${fieldName} = ? WHERE user_id = ?`,
                    [newValue, userId],
                    (err, r) => {
                        if (err) return reject(err);
                        console.log(`✅ audit.${fieldName} updated:`, r.affectedRows, "rows");
                        resolve();
                    }
                );
            }),
            new Promise((resolve, reject) => {
                db.query(
                    `UPDATE audit_detail SET ${fieldName} = ? WHERE user_id = ?`,
                    [newValue, userId],
                    (err, r) => {
                        if (err) return reject(err);
                        console.log(`✅ audit_detail.${fieldName} updated:`, r.affectedRows, "rows");
                        resolve();
                    }
                );
            })
        ])
        .then(() => res.json({ Status: "Success" }))
        .catch((err) => res.status(500).json({ Error: err.message }));

    } else {
        return res.status(400).json({ Error: `Champ inconnu: ${fieldName}` });
    }
});
// 1. Route pour récupérer les infos de l'analyste
app.get('/api/analyste-profile', verifyToken, (req, res) => {
    const sql = "SELECT Nom, Email, Telephone, Adresse, photo FROM utilisateur WHERE Id = ?";
    db.query(sql, [req.userId], (err, result) => {
        if (err) return res.status(500).json(err);
        return res.json(result[0]);
    });
});

// 2. Route pour mettre à jour les infos
app.put('/api/update-analyste', verifyToken, (req, res) => {
    const userId = req.userId;
    const updatedData = req.body;
    const fieldName = Object.keys(updatedData)[0];
    const newValue = Object.values(updatedData)[0];

    const sql = `UPDATE utilisateur SET ${fieldName} = ? WHERE Id = ?`;
    db.query(sql, [newValue, userId], (err, result) => {
        if (err) return res.status(500).json(err);
        return res.status(200).send("Mise à jour réussie");
    });
});
// route de ppour mettre a jour le photo de profil 
app.get('/api/analyste-profile', verifyToken, (req, res) => {
    const sql = "SELECT Nom, Email, Telephone, Adresse, photo FROM utilisateur WHERE Id = ?";
    db.query(sql, [req.userId], (err, result) => {
        if (err) return res.status(500).json(err);
        
        // ✅ Handle Buffer أو object
if (user.photo) {
    if (Buffer.isBuffer(user.photo)) {
        user.photo = user.photo.toString('utf8');
    } else if (user.photo.type === 'Buffer' && user.photo.data) {
        user.photo = Buffer.from(user.photo.data).toString('utf8');
    }
}

return res.json(user);
    });
});

// ✅ Servir les images statiques
app.use('/uploads', express.static('uploads'));

// ✅ Route upload photo
app.post('/api/upload-photo', verifyToken, upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ Error: "Aucun fichier reçu" });

    const photoUrl = `/uploads/${req.file.filename}`;
    
    const sql = "UPDATE utilisateur SET photo = ? WHERE Id = ?";
    db.query(sql, [photoUrl, req.userId], (err) => {
        if (err) return res.status(500).json({ Error: err.message });
        res.json({ Status: "Success", photoUrl: photoUrl });
    });
});
// ==========================================
// ✅ PARTIE GESTION UTILISATEUR (ADMIN CRUD)
// ==========================================

// 1. Get All Users (Tableau l-kol)
app.get('/api/admin/users', (req, res) => {
    const sql = "SELECT Id, Nom, Email, Telephone, Adresse, Role FROM utilisateur"; 
    db.query(sql, (err, data) => {
        if (err) {
            console.error("Erreur SQL Admin Get All:", err);
            return res.status(500).json(err);
        }
        return res.json(data);
    });
});

// 2. Get Single User (Pour m3abbé el formulaire de modification)
app.get('/api/admin/users/:id', (req, res) => {
    const id = req.params.id;
    // ⚠️ Dima 'utilisateur'
    const sql = "SELECT Id, Nom, Email, Role, Telephone, Adresse FROM utilisateur WHERE Id = ?"; 
    db.query(sql, [id], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json(data[0]);
    });
});

// 4. Update User (Modifier)
app.put('/api/admin/users/:id', (req, res) => {
    const id = req.params.id;
    const { Nom, Email, Telephone, Adresse, Role } = req.body;
    // ⚠️ Dima 'utilisateur'
    const sql = "UPDATE utilisateur SET Nom = ?, Email = ?, Telephone = ?, Adresse = ?, Role = ? WHERE Id = ?";
    db.query(sql, [Nom, Email, Telephone, Adresse, Role, id], (err, result) => {
        if (err) return res.status(500).json({ Error: err });
        return res.json({ Status: "Success" });
    });
});

// 5. Delete User (Supprimer)
app.delete('/api/admin/users/:id', verifyToken, (req, res) => {
    const userId = req.params.id;
    // ⚠️ Hna zeda badalha 'utilisateur'
    const deleteUserSql = "DELETE FROM utilisateur WHERE Id = ?";
    db.query(deleteUserSql, [userId], (err, result) => {
        if (err) return res.status(500).json({ Error: "Erreur suppression" });
        return res.json({ Status: "Success" });
    });
});
// Route pour ajouter un utilisateur par l'Admin
app.post('/api/admin/users/add', (req, res) => {
    const { Nom, Email, Password, Telephone, Adresse, Role } = req.body;
    
    // 🔒 CRYPTAGE AVANT INSERTION
    bcrypt.hash(Password.toString(), 10, (err, hash) => {
        if (err) return res.status(500).json({ Error: "Erreur cryptage" });

        const sql = "INSERT INTO utilisateur (Nom, Email, MotDePass, Telephone, Adresse, Role) VALUES (?, ?, ?, ?, ?, ?)";
        db.query(sql, [Nom, Email, hash, Telephone, Adresse, Role], (err, result) => {
            if (err) return res.status(500).json({ Error: err.sqlMessage });
            return res.json({ Status: "Success" });
        });
    });
});
//==============================================
//Gestions de Questions
//==============================================
//kifeh  jebna mil base :

// 1. GET toutes les questions
app.get('/api/questions', (req, res) => {
    const sql = "SELECT * FROM question ORDER BY nomSegment, ordre ASC";
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json({ Error: err.sqlMessage });
        return res.json(data);
    });
});

// 2. AJOUTER avec ordre choisi
app.post('/api/questions/add', (req, res) => {
    const { contenu, piliers, nomSegment, ordre } = req.body;

    // Compter combien de questions existent déjà dans ce segment
    const countSql = "SELECT COUNT(*) as total FROM question WHERE nomSegment = ?";
    db.query(countSql, [nomSegment], (err, countResult) => {
        if (err) return res.status(500).json(err);

        const total = countResult[0].total;
        const ordreChoisi = ordre && ordre >= 1 && ordre <= total + 1 ? ordre : total + 1;

        // Décaler les questions >= ordreChoisi
        const decalerSql = "UPDATE question SET ordre = ordre + 1 WHERE nomSegment = ? AND ordre >= ?";
        db.query(decalerSql, [nomSegment, ordreChoisi], (err) => {
            if (err) return res.status(500).json(err);

            // Insérer la nouvelle question
            const insertSql = "INSERT INTO question (contenu, piliers, nomSegment, note, ordre) VALUES (?, ?, ?, 0, ?)";
            db.query(insertSql, [contenu, piliers, nomSegment, ordreChoisi], (err) => {
                if (err) return res.status(500).json(err);
                return res.json({ Status: "Success" });
            });
        });
    });
});

// 3. SUPPRIMER + réorganiser l'ordre
app.delete('/api/questions/:id', (req, res) => {
    const id = req.params.id;

    // Récupérer l'ordre et segment de la question à supprimer
    db.query("SELECT ordre, nomSegment FROM question WHERE IdQu = ?", [id], (err, result) => {
        if (err) return res.status(500).json(err);
        if (result.length === 0) return res.status(404).json({ Error: "Question introuvable" });

        const { ordre, nomSegment } = result[0];

        // Supprimer la question
        db.query("DELETE FROM question WHERE IdQu = ?", [id], (err) => {
            if (err) return res.status(500).json(err);

            // Réorganiser les ordres après suppression
            db.query(
                "UPDATE question SET ordre = ordre - 1 WHERE nomSegment = ? AND ordre > ?",
                [nomSegment, ordre]
            );
            return res.json({ Status: "Success" });
        });
    });
});

// 4. MODIFIER
app.put('/api/questions/update/:id', (req, res) => {
    const id = req.params.id;
    const { contenu, piliers, nomSegment } = req.body;
    const sql = "UPDATE question SET contenu = ?, piliers = ?, nomSegment = ? WHERE IdQu = ?";
    db.query(sql, [contenu, piliers, nomSegment, id], (err) => {
        if (err) return res.status(500).json(err);
        return res.json({ Status: "Success" });
    });
});
//=================================
// routes messagerie
// ===============================
// Route Contact : Enregistrement + Envoi Mail
app.post('/api/contact', (req, res) => {
    console.log("DATA RECUE:", req.body);

    const { nom, telephone, email, societe, message, projet_info } = req.body;

    const sql = "INSERT INTO contact_messages (nom, telephone, email, societe, message, projet_info) VALUES (?, ?, ?, ?, ?, ?)";

    db.query(sql, [nom, telephone, email, societe, message, projet_info], (err, result) => {
        if (err) {
            console.error("SQL Error:", err);
            return res.status(500).json({ Error: "Erreur database" });
        }
        // Après le INSERT contact_messages réussi:
const notifSql = "INSERT INTO notifications (role_target, type, content) VALUES ('admin', 'message', ?)";
db.query(notifSql, [`Nouveau message de: ${nom} — ${email}`]);

        // ✅ ENVOI EMAIL
        const mailOptions = {
            from: 'digimaturity@gmail.com',
            to: 'digimaturity@gmail.com' , // 
            subject: '📩 Nouveau message de contact',
            text: `
Nom: ${nom}
Email: ${email}
Téléphone: ${telephone}
Société: ${societe}

Message:
${message}

Projet:
${projet_info}
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("❌ Mail Error:", error);
                return res.status(500).json({ Error: "Erreur envoi mail" });
            }

            console.log("📧 Email envoyé:", info.response);
            return res.json({ Status: "Success + Mail envoyé" });
        });
    });
});
// Route bech el Admin ychouf el messages
app.get('/api/admin/messages', verifyToken, (req, res) => {
    const sql = "SELECT * FROM contact_messages ORDER BY date_envoi DESC";
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json(data);
    });
});
//admin supprime les messagerie
app.delete('/api/admin/messages/:id', (req, res) => {
    const id = req.params.id;
    const sql = "DELETE FROM contact_messages WHERE id = ?";
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json(err);
        return res.json({ Status: "Success" });
    });
});

// Route bech njibou les questions mta3 el diagnostic
app.get('/api/questions', (req, res) => {
    const sql = "SELECT * FROM question"; // Thabbet mel esm mta3 el table s7i7
    db.query(sql, (err, data) => {
        if (err) return res.json({ Error: "Erreur lors de la récupération des questions" });
        return res.json(data);
    });
});
// ========================
// route page gerer questions
// ==============================
// Route bech njibou el questions mta3 segment mo3ayyen
app.get('/api/questions/:segment', (req, res) => {
    const segment = req.params.segment;
    
    // Log sghir bech fil terminal tchouf chnouwa jek mel React
    console.log("Recherche questions pour le segment :", segment);

    const sql = "SELECT * FROM question WHERE nomSegment = ?";
    db.query(sql, [segment], (err, data) => {
        if (err) {
            console.error("Erreur SQL:", err);
            return res.status(500).json({ Error: "Database error" });
        }
        
        if (data.length === 0) {
            console.warn(`Attention: Aucune question trouvée pour le segment "${segment}"`);
        }
        
        return res.json(data);
    });
});
// ==============================
// route diagnostic
// ==============================
//enregister les reponse et les scores
app.post('/api/save-audit-complet', (req, res) => {
    const { entrepriseNom, scoreGlobal, detailsPiliers, reponsesIndividuelles, choixEntreprise } = req.body;
 
    console.log("📥 save-audit-complet pour :", entrepriseNom);
 
    const detailsJSON  = JSON.stringify(detailsPiliers);
    const reponsesJSON = JSON.stringify(reponsesIndividuelles);
    const dateAudit    = new Date().toISOString().slice(0, 19).replace('T', ' ');
 
    // 1️⃣ Cherche le dernier test actif (is_history = 0)
    const sqlCheck = `
        SELECT idRep, dateAudit
        FROM reponse
        WHERE LOWER(TRIM(entrepriseNom)) = LOWER(TRIM(?))
        AND is_history = 0
        ORDER BY dateAudit DESC
        LIMIT 1
    `;
 
    db.query(sqlCheck, [entrepriseNom], (err, result) => {
        if (err) return res.status(500).json({ error: "Erreur vérification" });
 
        if (result.length > 0) {
            const lastDate = new Date(result[0].dateAudit);
            const diffH    = (Date.now() - lastDate.getTime()) / 3600000;
            const idRep    = result[0].idRep;
 
            console.log("⏰ Heures écoulées:", diffH.toFixed(2));
 
            // ✅ Moins de 24h → UPDATE (correction du jour)
            if (diffH < 24) {
                const sqlUpdate = `
                    UPDATE reponse
                    SET scoreGlobal     = ?,
                        detailsPiliers  = ?,
                        reponsesDetails = ?,
                        ChoixEntreprise = ?,
                        dateAudit       = ?
                    WHERE idRep = ?
                `;
                db.query(sqlUpdate,
                    [scoreGlobal, detailsJSON, reponsesJSON, choixEntreprise, dateAudit, idRep],
                    (err2) => {
                        if (err2) return res.status(500).json({ error: "Erreur UPDATE" });
                        console.log("✅ UPDATE effectué — idRep:", idRep);
                        addNotification('analyst', 'diagnostic', `📊 Diagnostic mis à jour: ${entrepriseNom} — Score: ${scoreGlobal}%`);
                        return res.status(200).json({ message: "Audit mis à jour", action: "UPDATE" });
                    }
                );
                return; // ← STOP
            }
 
            // ✅ Plus de 24h → archiver l'ancien PUIS insérer le nouveau
            const sqlArchive = `
                UPDATE reponse SET is_history = 1 WHERE idRep = ?
            `;
            db.query(sqlArchive, [idRep], (errArchive) => {
                if (errArchive) {
                    console.error("❌ Erreur archivage:", errArchive);
                    // On continue quand même pour ne pas bloquer
                }
                console.log("📦 Ancien test archivé — idRep:", idRep);
 
                // INSERT le nouveau test actif
                insererNouveauTest();
            });
            return; // ← STOP (insererNouveauTest s'exécute dans le callback)
        }
 
        // Aucun test existant → INSERT direct
        insererNouveauTest();
 
        // ── Fonction INSERT ──
        function insererNouveauTest() {
            const sqlInsert = `
                INSERT INTO reponse
                    (entrepriseNom, scoreGlobal, detailsPiliers, reponsesDetails, ChoixEntreprise, dateAudit, is_history)
                VALUES (?, ?, ?, ?, ?, ?, 0)
            `;
            db.query(sqlInsert,
                [entrepriseNom, scoreGlobal, detailsJSON, reponsesJSON, choixEntreprise, dateAudit],
                (err3) => {
                    if (err3) {
                        console.error("❌ Erreur INSERT:", err3);
                        return res.status(500).json({ error: "Erreur INSERT" });
                    }
                    console.log("✅ Nouveau test inséré pour:", entrepriseNom);
                    addNotification('analyst', 'diagnostic', `✅ Nouveau diagnostic: ${entrepriseNom} — Score: ${scoreGlobal}%`);
                    return res.status(200).json({ message: "Audit sauvegardé", action: "INSERT" });
                }
            );
        }
    });
});
// route historique de test de maturité
app.get('/api/audit/historique', verifyToken, (req, res) => {
 
    // 1. Récupère le vrai nom de l'entreprise depuis son token
    const sqlNom = "SELECT Nom FROM utilisateur WHERE Id = ?";
 
    db.query(sqlNom, [req.userId], (err, userResult) => {
        if (err) return res.status(500).json({ error: "Erreur SQL user" });
        if (userResult.length === 0) return res.status(404).json({ error: "User non trouvé" });
 
        const nomEntreprise = userResult[0].Nom;
 
        // 2. Récupère les anciens tests (is_history = 1) de cette entreprise
        const sql = `
            SELECT *
            FROM reponse
            WHERE LOWER(TRIM(entrepriseNom)) = LOWER(TRIM(?))
            AND is_history = 1
            ORDER BY dateAudit DESC
        `;
 
        db.query(sql, [nomEntreprise], (err2, data) => {
            if (err2) return res.status(500).json({ error: "Erreur SQL historique" });
            return res.json(data);
        });
    });
});
// ==================================
// partie coach IA (groq + gemini)
// ====================================
require('dotenv').config();
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const { GoogleGenerativeAI } = require("@google/generative-ai");
console.log("Vérification Clé API:", process.env.GEMINI_API_KEY ? "Clé Trouvée" : "CLÉ ABSENTE !");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
    apiVersion: 'v1'
});
app.post('/api/get-coach-advice', async (req, res) => {
    const { scores, allAnswers, idReponse, contexte } = req.body;
    const answers = allAnswers || [];
    const weakPoints = answers.filter(a => a.valeur < 3);

    try {
        const prompt = `Tu es un expert consultant en transformation digitale 
spécialisé pour les entreprises Tunisiennes.

Entreprise: ${contexte?.entrepriseNom || 'Non précisé'}
Secteur: ${contexte?.secteur || 'Non précisé'}
Segment: ${contexte?.segment || 'Non précisé'}
Taille: ${contexte?.effectif_range || 'Non précisé'} employés

Scores de maturité digitale:
${scores.map(s => `- ${s.name}: ${s.val}%`).join('\n')}

Points faibles (score < 3/5): ${JSON.stringify(weakPoints)}

Génère une analyse structurée EXACTEMENT comme suit:
**📊 DIAGNOSTIC GLOBAL**
[2-3 phrases sur la situation globale]
**🎯 STRATÉGIE - ${scores.find(s=>s.name==='Stratégie')?.val}%**
[2 conseils détaillés et actionnables]
**⚙️ OPÉRATIONNEL - ${scores.find(s=>s.name==='Opérationnel')?.val}%**
[2 conseils détaillés et actionnables]
**💻 TECHNIQUE - ${scores.find(s=>s.name==='Technique')?.val}%**
[2 conseils détaillés et actionnables]
**📣 MARKETING - ${scores.find(s=>s.name==='Marketing')?.val}%**
[2 conseils détaillés et actionnables]
[Le pilier le plus urgent et pourquoi]
Réponds en Français. Sois précis et pratique.`;

        const response = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                {
                    role: "system",
                    content: "Tu es un coach expert en transformation digitale pour les PME Tunisiennes."
                },
                { role: "user", content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.7
        });

        const advice = response.choices[0].message.content;
        console.log("✅ Groq AI OK!");

        const query = "INSERT INTO conseils_ia (id_reponse, contenu_conseil) VALUES (?, ?)";
        db.query(query, [idReponse, advice], (err, result) => {
            if (err) {
                console.error("❌ Erreur base de données:", err);
                return res.json({ advice, saved: false });
            }
            console.log("✅ Conseils sauvegardés dans la base !");
            res.json({ advice, saved: true });
        });

    } catch (err) {
        console.error("❌ Groq Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
// ================================
// Route Chatbot IA Interactif
// ================================
app.post('/api/chatbot', verifyToken, async (req, res) => {
    const { message, historique, contexte } = req.body;

    try {
        const messages = [
            {
                role: "system",
                content: `Tu es un coach expert en transformation digitale spécialisé pour les entreprises Tunisiennes.
                
Voici les informations de l'entreprise :
- Nom: ${contexte?.entrepriseNom || 'Non précisé'}
- Secteur: ${contexte?.secteur || 'Non précisé'}
- Segment: ${contexte?.segment || 'Non précisé'}
- Taille: ${contexte?.effectif_range || 'Non précisé'} employés

Scores de maturité digitale:
${contexte?.scores?.map(s => `- ${s.name}: ${s.val}%`).join('\n') || 'Non disponible'}

Règles:
1. Réponds TOUJOURS en Français
2. Sois concis (max 3-4 phrases)
3. Donne des conseils spécifiques à leur secteur`
            },
            ...historique,
            { role: "user", content: message }
        ];

        const response = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: messages,
            max_tokens: 500,
            temperature: 0.7
        });

        const reply = response.choices[0].message.content;
        return res.json({ Status: "Success", reply: reply });

    } catch (err) {
        console.error("❌ Chatbot Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/get-last-audit/:nomEntreprise', (req, res) => {
    const nom = req.params.nomEntreprise;
    
    // ✅ FIX : entrepriseNom (camelCase) — c'est le vrai nom de colonne dans la table reponse
    const sqlReponse = `
        SELECT * FROM reponse 
        WHERE LOWER(TRIM(entrepriseNom)) = LOWER(TRIM(?))
        ORDER BY dateAudit DESC LIMIT 1
    `;
    
    db.query(sqlReponse, [nom], (err, data) => {
        if (err) {
            console.error("❌ SQL reponse error:", err.message);
            return res.status(500).json({ Error: err.message });
        }
        
        // ✅ Trouvé dans reponse → retourne directement
        if (data.length > 0) return res.json(data[0]);
        
        // ✅ Pas trouvé → fallback audit_detail
        const sqlFallback = `
            SELECT 
                entreprise_nom  AS entrepriseNom,
                secteur,
                zone_geo,
                segment,
                dateAudit,
                created_at,
                0               AS scoreGlobal,
                NULL            AS detailsPiliers,
                NULL            AS reponsesDetails
            FROM audit_detail
            WHERE LOWER(entreprise_nom) = LOWER(?)
            ORDER BY created_at DESC LIMIT 1
        `;
        
        db.query(sqlFallback, [nom], (err2, data2) => {
            if (err2) {
                console.error("❌ SQL audit_detail error:", err2.message);
                return res.status(500).json({ Error: err2.message });
            }
            
            // ✅ Pas dans audit_detail → fallback table audit
            if (data2.length === 0) {
                const sqlAudit = `
                    SELECT 
                        entreprise_nom  AS entrepriseNom,
                        secteur,
                        zone_geo,
                        segment,
                        dateAudit,
                        0               AS scoreGlobal,
                        NULL            AS detailsPiliers
                    FROM audit
                    WHERE user_id = (
                        SELECT Id FROM utilisateur 
                        WHERE LOWER(Nom) = LOWER(?) LIMIT 1
                    )
                    ORDER BY dateAudit DESC LIMIT 1
                `;
                db.query(sqlAudit, [nom], (err3, data3) => {
                    if (err3) {
                        console.error("❌ SQL audit error:", err3.message);
                        return res.status(500).json({ Error: err3.message });
                    }
                    if (data3.length === 0) return res.status(404).json({ Error: "Aucune donnée trouvée" });
                    return res.json(data3[0]);
                });
                return;
            }
            
            return res.json(data2[0]);
        });
    });
});
// ================================
//les graphs dynamique (page admin)
// =====================================
app.get('/api/admin/stats', (req, res) => {
    
    // 1. Stats par secteur
    const sqlSecteurs = "SELECT secteur, COUNT(*) as value FROM audit GROUP BY secteur";
    
    // 2. Stats par zone
    const sqlZones = "SELECT zone_geo as name, COUNT(*) as value FROM audit GROUP BY zone_geo";
    
    // 3. Sociétés critiques (mel reponse table)
    const sqlCritiques = "SELECT entrepriseNom, scoreGlobal FROM reponse WHERE scoreGlobal < 40 ORDER BY scoreGlobal ASC LIMIT 5";
    
    // 4. Utilisation par semaine
    const sqlUtilisation = `
        SELECT 
            CONCAT('Sem ', WEEK(dateAudit) - WEEK(MIN(dateAudit)) + 1) as name,
            COUNT(*) as val
        FROM audit 
        GROUP BY WEEK(dateAudit)
        ORDER BY WEEK(dateAudit)
        LIMIT 6
    `;

    // Execute kol el queries
    db.query(sqlSecteurs, (err, secteurs) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.query(sqlZones, (err, zones) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.query(sqlCritiques, (err, critiques) => {
                if (err) return res.status(500).json({ error: err.message });
                
                db.query(sqlUtilisation, (err, utilisation) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    res.json({
                        secteurs: secteurs.map(s => ({ name: s.secteur, value: s.value })),
                        zones: zones,
                        critiques: critiques,
                        utilisation: utilisation
                    });
                });
            });
        });
    });
});
// les graphs pour l'analyste (pages de l'analyste)
app.get('/api/analyste/stats', (req, res) => {

    // 1. Entreprises par niveau
    const sqlNiveaux = `
        SELECT 
            CASE 
                WHEN scoreGlobal <= 25 THEN 'Débutant'
                WHEN scoreGlobal <= 50 THEN 'En Transition'
                WHEN scoreGlobal <= 75 THEN 'Avancé'
                ELSE 'Leader'
            END as niveau,
            COUNT(*) as count
        FROM reponse
        GROUP BY niveau
    `;

    // 2. Entreprises critiques
    const sqlCritiques = `
        SELECT entrepriseNom, scoreGlobal 
        FROM reponse 
        WHERE scoreGlobal < 40 
        ORDER BY scoreGlobal ASC 
        LIMIT 6
    `;

    // 3. Score moyen par pilier
    const sqlPiliers = `
        SELECT 
            AVG(JSON_EXTRACT(detailsPiliers, '$.Stratégie')) as Strategie,
            AVG(JSON_EXTRACT(detailsPiliers, '$.Opérationnel')) as Operationnel,
            AVG(JSON_EXTRACT(detailsPiliers, '$.Technique')) as Technique,
            AVG(JSON_EXTRACT(detailsPiliers, '$.Marketing')) as Marketing
        FROM reponse
    `;

    // 4. Total audits par mois
    const sqlAudits = `
        SELECT 
            DATE_FORMAT(dateAudit, '%b %Y') as mois,
            COUNT(*) as total
        FROM reponse
        GROUP BY DATE_FORMAT(dateAudit, '%b %Y')
        ORDER BY MIN(dateAudit)
        LIMIT 6
    `;

    db.query(sqlNiveaux, (err, niveaux) => {
        if (err) return res.status(500).json({ error: err.message });

        db.query(sqlCritiques, (err, critiques) => {
            if (err) return res.status(500).json({ error: err.message });

            db.query(sqlPiliers, (err, piliers) => {
                if (err) return res.status(500).json({ error: err.message });

                db.query(sqlAudits, (err, audits) => {
                    if (err) return res.status(500).json({ error: err.message });

                    // Format piliers
                    const pilierFormatted = [
                        { name: 'Stratégie', avg: Math.round(piliers[0]?.Strategie || 0) },
                        { name: 'Opérationnel', avg: Math.round(piliers[0]?.Operationnel || 0) },
                        { name: 'Technique', avg: Math.round(piliers[0]?.Technique || 0) },
                        { name: 'Marketing', avg: Math.round(piliers[0]?.Marketing || 0) }
                    ];

                    res.json({
                        niveaux,
                        critiques,
                        piliers: pilierFormatted,
                        audits: audits.map(a => ({ name: a.mois, total: a.total }))
                    });
                });
            });
        });
    });
});
// route page Diagnostics 

app.get('/api/diagnostics', (req, res) => {
    // On sélectionne tout de 'reponse' (r.* inclut déjà ChoixEntreprise)
    // et on fait la jointure avec les conseils
    const query = `
    SELECT r.*, c.contenu_conseil 
    FROM reponse r
    LEFT JOIN conseils_ia c ON r.idRep = c.id_reponse
    WHERE r.archived = FALSE OR r.archived IS NULL
`;
    db.query(query, (err, results) => {
        if (err) return res.status(500).send(err);
        
        const formattedResults = results.reduce((acc, row) => {
            const index = acc.findIndex(item => item.idRep === row.idRep);
            if (index === -1) {
                // Ici, ChoixEntreprise est déjà inclus dans '...row'
                acc.push({ 
                    ...row, 
                    conseils: row.contenu_conseil ? [row.contenu_conseil] : [] 
                });
            } else if (row.contenu_conseil) {
                acc[index].conseils.push(row.contenu_conseil);
            }
            return acc;
        }, []);
        
        res.json(formattedResults);
    });
});

// ================================
// Route Plan analyste
// ================================
app.post('/api/envoyer-plan', (req, res) => {
    const { email, contenu, fileData, fileName, entreprise_nom } = req.body;

    // 1️⃣ Sauvegarder le PDF dans la base
    const pdfBuffer = Buffer.from(fileData.split(',')[1], 'base64');
    
    const sqlInsert = "INSERT INTO plans_action (entreprise_nom, nom_fichier, fichier_pdf) VALUES (?, ?, ?)";
    
    db.query(sqlInsert, [entreprise_nom, fileName, pdfBuffer], (err, result) => {
        if (err) {
            console.error("❌ Erreur SQL:", err);
            return res.status(500).json({ Error: "Erreur sauvegarde PDF" });
        }

        console.log("✅ PDF sauvegardé dans la base !");
        // Notification pour l'entreprise
const notifPlanSql = "INSERT INTO notifications (role_target, type, content) VALUES ('entreprise', 'plan', ?)";
db.query(notifPlanSql, [`📋 Un nouveau plan d'action est disponible pour ${entreprise_nom}`]);

        // 2️⃣ Envoyer email notification SEULEMENT (pas le PDF)
        const mailOptions = {
            from: 'digimaturity@gmail.com',
            to: email,
            subject: '📋 Nouveau Plan d\'action disponible - DiGi-Maturity',
            html: `
                <div style="font-family: sans-serif; padding: 30px; background: #f0f4ff; border-radius: 10px;">
                    <h2 style="color: #0072ff;">DiGi-Maturity</h2>
                    <p>Bonjour,</p>
                    <p>Un nouveau <strong>Plan d'action de maturité digitale</strong> est disponible sur votre espace.</p>
                    <p style="color: #555;">${contenu}</p>
                    <br/>
                    <a href="http://localhost:3000/DashboardEntreprise" 
                       style="background: #0072ff; color: white; padding: 12px 25px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                        Accéder à mon espace
                    </a>
                    <br/><br/>
                    <p style="color: #999; font-size: 12px;">DiGi-Maturity © 2024</p>
                </div>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("❌ Mail Error:", error);
                return res.status(500).json({ Error: "Erreur envoi mail" });
            }
            console.log("📧 Email notification envoyé !");
            res.status(200).json({ Status: "Success" });
        });
    });
});

// ================================
// Route plans pour l'entreprise 
// ================================
app.get('/api/mes-plans', verifyToken, (req, res) => {
    const nomEntreprise = req.query.nom;
    console.log("Tentative de récupération pour :", nomEntreprise);

    const sql = "SELECT id, entreprise_nom, nom_fichier, date_envoi, lu FROM plans_action WHERE LOWER(entreprise_nom) = LOWER(?) ORDER BY date_envoi DESC";
    
    db.query(sql, [nomEntreprise], (err, data) => {
        if (err) return res.status(500).json({ Error: err.message });
        return res.json(data);
    });
});
// ================================
// Route pour télécharger le PDF
// ================================
app.get('/api/telecharger-plan/:id', verifyToken, (req, res) => {
    const id = req.params.id;
    const sql = "SELECT fichier_pdf, nom_fichier FROM plans_action WHERE id = ?";
    
    db.query(sql, [id], (err, data) => {
        if (err) return res.status(500).json({ Error: err.message });
        if (data.length === 0) return res.status(404).json({ Error: "Plan non trouvé" });

        // Marquer comme lu
        db.query("UPDATE plans_action SET lu = TRUE WHERE id = ?", [id]);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${data[0].nom_fichier}"`);
        res.send(data[0].fichier_pdf);
    });
});

// =================================
// Update entreprise quand plan envoyer
// ========================================
app.put('/api/reponse/status/:idRep', (req, res) => {
    const idRep = req.params.idRep;
    const sql = "UPDATE reponse SET status_plan = 'envoyé' WHERE idRep = ?";
    db.query(sql, [idRep], (err) => {
        if (err) return res.status(500).json({ Error: err.message });
        return res.json({ Status: "Success" });
    });
});
// Créer un rendez-vous
app.post('/api/rendez-vous', verifyToken, (req, res) => {
    const { entreprise_nom, email_entreprise, date_rdv, note } = req.body;

    // ✅ Fix timezone Tunisie UTC+1
    // On sauvegarde la date telle quelle sans conversion UTC
    const dateFormatted = date_rdv.includes('T') 
        ? date_rdv.replace('T', ' ').substring(0, 19)  // format ISO → MySQL
        : date_rdv;                                      // déjà bon format

    const sql = "INSERT INTO rendez_vous (entreprise_nom, email_entreprise, date_rdv, note) VALUES (?, ?, ?, ?)";
    db.query(sql, [entreprise_nom, email_entreprise, dateFormatted, note], (err, result) => {
        if (err) return res.status(500).json({ Error: err.message });

        // ✅ Affichage correct sans conversion UTC
        const dateAffichage = dateFormatted.replace(' ', ' à ').substring(0, 16).replace('-', '/').replace('-', '/');

        sendNotification(
            "📅 Nouveau Rendez-vous fixé",
            `Un rendez-vous a été fixé avec l'entreprise <b>${entreprise_nom}</b><br>
             <b>Date:</b> ${dateFormatted}<br>
             <b>Note:</b> ${note}`
        );

        const mailOptions = {
            from: 'digimaturity@gmail.com',
            to: email_entreprise,
            subject: '📅 Rendez-vous confirmé - DiGi-Maturity',
            html: `
                <div style="font-family: sans-serif; padding: 30px;">
                    <h2 style="color: #0072ff;">DiGi-Maturity</h2>
                    <p>Bonjour,</p>
                    <p>Votre rendez-vous avec l'analyste a été confirmé !</p>
                    <p><b>📅 Date :</b> ${dateFormatted}</p>
                    ${note ? `<p><b>📝 Note :</b> ${note}</p>` : ''}
                    <a href="http://localhost:3000/MonCalendrier" 
                       style="background:#0072ff;color:white;padding:12px 25px;border-radius:8px;text-decoration:none;">
                        Voir mon calendrier
                    </a>
                </div>
            `
        };
        transporter.sendMail(mailOptions, () => {});

        // ✅ Notification entreprise
        const notifRdvSql = "INSERT INTO notifications (role_target, type, content) VALUES ('entreprise', 'rdv', ?)";
        db.query(notifRdvSql, [`📅 Un rendez-vous a été fixé le ${dateFormatted}`]);

        res.json({ Status: "Success", id: result.insertId });
    });
});
// Get rendez-vous par entreprise
app.get('/api/rendez-vous/entreprise', verifyToken, async (req, res) => {
    const nom = req.query.nom;
    const sql = "SELECT * FROM rendez_vous WHERE entreprise_nom = ? ORDER BY date_rdv DESC";
    db.query(sql, [nom], (err, data) => {
        if (err) return res.status(500).json({ Error: err.message });
        res.json(data);
    });
});

// Get tous les rendez-vous pour l'analyste
app.get('/api/rendez-vous/all', verifyToken, (req, res) => {
    const sql = "SELECT * FROM rendez_vous ORDER BY date_rdv ASC";
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json({ Error: err.message });
        res.json(data);
    });
});

// Confirmation de rendez-vous par L'ENTREPRISE
app.put('/api/rendez-vous/confirmer/:id', verifyToken, (req, res) => {
    const idRdv = req.params.id;

    const sqlGetInfo = "SELECT entreprise_nom, date_rdv FROM rendez_vous WHERE id = ?";
    db.query(sqlGetInfo, [idRdv], (err, result) => {
        if (err || result.length === 0) return res.status(500).json({ Error: "RDV non trouvé" });

        const nomEntreprise = result[0].entreprise_nom;
        const dateRdv = result[0].date_rdv
            ? new Date(result[0].date_rdv).toLocaleDateString('fr-FR')
            : '';

        const sqlUpdateRdv = "UPDATE rendez_vous SET statut = 'confirmé' WHERE id = ?";
        const sqlUpdateReponse = "UPDATE reponse SET status_date = 'confirmer' WHERE entrepriseNom = ? AND archived = 0";

        db.query(sqlUpdateRdv, [idRdv], (err1) => {
            if (err1) return res.status(500).json({ Error: err1.message });

            db.query(sqlUpdateReponse, [nomEntreprise], (err2) => {
                if (err2) return res.status(500).json({ Error: err2.message });

                // ✅ BADGE AGENDA — notification pour l'analyste
                const notifSql = "INSERT INTO notifications (role_target, type, content) VALUES ('analyst', 'agenda', ?)";
                db.query(notifSql, [`📅 ${nomEntreprise} a confirmé le rendez-vous du ${dateRdv}`]);

                return res.json({ Status: "Success" });
            });
        });
    });
});
// Annulation ou Refus par l'entreprise
app.put('/api/rendez-vous/refuser/:id', verifyToken, (req, res) => {
    const idRdv = req.params.id;

    const sqlGetInfo = "SELECT entreprise_nom FROM rendez_vous WHERE id = ?";

    db.query(sqlGetInfo, [idRdv], (err, result) => {
        if (err || result.length === 0) return res.status(500).json({ Error: "RDV non trouvé" });

        const nomEntreprise = result[0].entreprise_nom;

        const sqlUpdateRdv = "UPDATE rendez_vous SET statut = 'refusé' WHERE id = ?";
        const sqlUpdateReponse = "UPDATE reponse SET status_date = 'refusé' WHERE entrepriseNom = ? AND archived = 0";

        db.query(sqlUpdateRdv, [idRdv], (err1) => {
            if (err1) return res.status(500).json({ Error: err1.message });

            db.query(sqlUpdateReponse, [nomEntreprise], (err2) => {
                if (err2) return res.status(500).json({ Error: err2.message });

                // ✅ type 'agenda' pour le badge
                addNotification('analyst', 'agenda', `❌ ${nomEntreprise} a refusé le rendez-vous proposé`);

                // Email existant inchangé
                sendNotification(
                    "❌ Rendez-vous Refusé",
                    `L'entreprise <b>${nomEntreprise}</b> a refusé le créneau proposé.`
                );

                return res.json({ Status: "Success" });
            });
        });
    });
});
// ========================================
// --- ROUTES POUR L'AGENDA DE L'ANALYSTE ---
// ============================================

// 1. Récupérer toutes les notes de l'agenda
app.get('/api/agenda-analyste', (req, res) => {
    const sql = "SELECT * FROM agenda_analyste ORDER BY date_evenement ASC";
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json(data);
    });
});

// 2. Ajouter une nouvelle note (Celle qui déclenche l'erreur 404 actuellement)
app.post('/api/agenda-analyste', (req, res) => {
    const sql = "INSERT INTO agenda_analyste (`titre`, `description`, `date_evenement`, `type`) VALUES (?)";
    const values = [
        req.body.titre,
        req.body.description || '',
        req.body.date_evenement,
        'perso' // On définit le type par défaut comme 'perso'
    ];

    db.query(sql, [values], (err, data) => {
        if (err) return res.status(500).json(err);
        return res.status(200).json("Note ajoutée avec succès !");
    });
});
// Route unique pour modifier le titre ET/OU la date
app.put('/api/agenda-analyste/:id', (req, res) => {
    const { id } = req.params;
    const { titre, date_evenement } = req.body;

    // On prépare la requête dynamiquement selon ce qu'on reçoit
    let sql = "UPDATE agenda_analyste SET titre = COALESCE(?, titre), date_evenement = COALESCE(?, date_evenement) WHERE id = ?";
    
    db.query(sql, [titre, date_evenement, id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json(err);
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Note non trouvée" });
        }
        return res.status(200).json("Mise à jour réussie");
    });
});
app.put('/api/rendez-vous/confirmer/:id', verifyToken, (req, res) => {
    const idRdv = req.params.id;

    const sqlGetInfo = "SELECT entreprise_nom, date_rdv FROM rendez_vous WHERE id = ?";

    db.query(sqlGetInfo, [idRdv], (err, result) => {
        if (err || result.length === 0) return res.status(500).json({ Error: "RDV non trouvé" });

        const nomEntreprise = result[0].entreprise_nom;
        const dateRdv = result[0].date_rdv 
            ? new Date(result[0].date_rdv).toLocaleDateString('fr-FR') 
            : '';

        const sqlUpdateRdv = "UPDATE rendez_vous SET statut = 'confirmé' WHERE id = ?";
        const sqlUpdateReponse = "UPDATE reponse SET status_date = 'confirmer' WHERE entrepriseNom = ? AND archived = 0";

        db.query(sqlUpdateRdv, [idRdv], (err1) => {
            if (err1) return res.status(500).json({ Error: err1.message });

            db.query(sqlUpdateReponse, [nomEntreprise], (err2) => {
                if (err2) return res.status(500).json({ Error: err2.message });

                // ✅ type 'agenda' pour le badge
                addNotification('analyst', 'agenda', `📅 ${nomEntreprise} a confirmé le rendez-vous du ${dateRdv}`);

                return res.json({ Status: "Success" });
            });
        });
    });
});
app.delete('/api/agenda-analyste/:id', (req, res) => {

    const sql = "DELETE FROM agenda_analyste WHERE id = ?";

    db.query(sql, [req.params.id], (err, result) => {

        if (err) {
            return res.status(500).json(err);
        }

        res.json({
            message: "Note supprimée avec succès"
        });
    });
});
// SERVER RUN
app.listen(8081, () => {
    console.log("🚀 SERVEUR AYOUTA : http://localhost:8081");
});