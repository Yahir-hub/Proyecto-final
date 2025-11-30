import express from 'express';
import session from 'express-session';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config'; 
import conectarDB from './bd/conexionBD.js';
import mainRouter from './routes/index.js';
import { userMiddleware } from './middleware/auth.js';

// Configuración de rutas de archivos
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Inicialización de Express
const app = express();
const PORT = process.env.PORT || 3100;

// Configuración de EJS y Vistas
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views'); // Carpeta de vistas
app.set('title', 'Sistema de Inventario');

// Configuración de sesiones
app.use(session({
    secret: process.env.SESSION_SECRET || 'mi-secreto-super-seguro',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 horas
}));

// Middleware
app.use(express.urlencoded({ extended: true })); // Para formularios
app.use(express.json()); // Para peticiones API como el buscador
app.use(express.static('public')); // Para archivos estáticos
app.use(userMiddleware); // Middleware para pasar datos de usuario a las vistas

// Rutas principales
app.use('/', mainRouter);

// Conectar a la base de datos
// conectarDB(); <-- eliminar llamada directa

async function start() {
    try {
        await conectarDB(); // esperar a conectar
        // Inicialización de Express (ya definida arriba)
        app.listen(PORT, () => {
            console.log(`Servidor de Inventario escuchando en http://localhost:${PORT}`);
            console.log('Presiona Ctrl+C para detener el servidor.');
        });
    } catch (err) {
        console.error('Error al conectar a la base de datos:', err);
        process.exit(1);
    }
}

start();