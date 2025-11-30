import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Modelos (Archivos en minúsculas)
import Producto from '../models/Producto.js';
import Categoria from '../models/Categoria.js';
import Venta from '../models/venta.js';
import Usuario from '../models/usuario.js'; 
import { requireAuth, requireAdmin, requireAlmacenista, requireVendedor } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();

// Configuración de Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// Variable para reset diario
let fechaInicioConteoDia = new Date();
fechaInicioConteoDia.setHours(0,0,0,0); 

// =================================================================
// FUNCIONES AUXILIARES (LÓGICA)
// =================================================================

// FUNCIÓN RECUPERADA: Calcular existencias para las gráficas
const calcularExistenciasPorCategoria = async () => {
    try {
        const existencias = await Producto.aggregate([
            { $group: { _id: '$categoriaID', totalExistencias: { $sum: '$cantidad' } } },
            { 
                $lookup: {
                    from: 'categorias',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'categoriaInfo'
                }
            },
            { $unwind: '$categoriaInfo' }, 
            { $project: { _id: 1, nombre: '$categoriaInfo.nombre', totalExistencias: 1 } }
        ]);
        return existencias;
    } catch (error) {
        console.error("Error al calcular existencias:", error);
        return [];
    }
};

// =================================================================
// RUTAS PRINCIPALES
// =================================================================

// HOME: Listado + Totales + Gráficas
router.get('/', requireAuth, async (req, res) => {
    try {
        const querySearch = req.query.q || '';
        let filtro = {};

        if (querySearch) {
            filtro = { nombre: { $regex: querySearch, $options: 'i' } };
        }

        const productos = await Producto.find(filtro).populate('categoriaID').lean();
        
        // --- 1. CÁLCULOS DE DINERO (Totales) ---
        const ventasGlobal = await Venta.aggregate([ { $group: { _id: null, total: { $sum: '$totalVenta' } } } ]);
        
        const semanaStart = new Date();
        semanaStart.setDate(semanaStart.getDate() - 7);
        const ventasSemana = await Venta.aggregate([
            { $match: { fechaVenta: { $gte: semanaStart } } },
            { $group: { _id: null, total: { $sum: '$totalVenta' } } }
        ]);

        const ventasDia = await Venta.aggregate([
            { $match: { fechaVenta: { $gte: fechaInicioConteoDia } } },
            { $group: { _id: null, total: { $sum: '$totalVenta' } } }
        ]);

        const totalVendido = ventasGlobal.length ? ventasGlobal[0].total : 0;
        const totalSemana = ventasSemana.length ? ventasSemana[0].total : 0;
        const totalDia = ventasDia.length ? ventasDia[0].total : 0;

        // --- 2. CÁLCULO DE EXISTENCIAS (Para las gráficas) ---
        const existenciasRaw = await calcularExistenciasPorCategoria();
        // Convertimos el array en un objeto simple { 'Bebidas': 100, 'Botanas': 50 }
        const existencias = existenciasRaw.reduce((acc, curr) => {
            acc[curr.nombre] = curr.totalExistencias;
            return acc;
        }, {});

        res.render('index', { 
            productos,
            totalVendido,
            totalSemana,
            totalDia,
            existencias, // <--- ¡AQUÍ ESTÁ LO QUE FALTABA!
            searchQuery: querySearch,
            mensaje: req.query.msg || null, 
            error: req.query.err || null
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

router.post('/ventas/reset-dia', requireAuth, requireAdmin, (req, res) => {
    fechaInicioConteoDia = new Date();
    res.redirect('/?msg=Contador diario reiniciado a 0');
});

// SUGERENCIAS (Stock Bajo)
router.get('/sugerencias', requireAuth, requireAlmacenista, async (req, res) => {
    try {
        const productosBajos = await Producto.find({ 
            $expr: { $lte: ["$cantidad", "$minStock"] } 
        }).populate('categoriaID').lean();
        res.render('productos/sugerencias', { productos: productosBajos });
    } catch (error) {
        res.redirect('/?err=Error al cargar sugerencias');
    }
});

// RESTOCK
router.get('/productos/restock', requireAuth, requireAlmacenista, async (req, res) => {
    try {
        const productos = await Producto.find().sort({ nombre: 1 }).lean();
        res.render('productos/restock', { productos, mensaje: req.query.msg, error: req.query.err });
    } catch (error) {
        res.redirect('/?err=Error carga restock');
    }
});

router.post('/productos/restock', requireAuth, requireAlmacenista, async (req, res) => {
    const { productoID, cantidadAgregar } = req.body;
    const cantidad = parseInt(cantidadAgregar);

    if (isNaN(cantidad) || cantidad <= 0) return res.redirect('/productos/restock?err=Cantidad inválida');

    try {
        const producto = await Producto.findById(productoID);
        if (!producto) return res.redirect('/productos/restock?err=Producto no encontrado');

        const stockFuturo = producto.cantidad + cantidad;
        if (stockFuturo > producto.maxStock) {
            return res.redirect(`/productos/restock?err=Error: El stock superaría el máximo permitido (${producto.maxStock}).`);
        }

        producto.cantidad += cantidad;
        await producto.save();
        res.redirect(`/productos/restock?msg=Agregadas ${cantidad} unidades a ${producto.nombre}`);
    } catch (error) {
        res.redirect(`/productos/restock?err=${error.message}`);
    }
});

// VENDER
router.post('/productos/vender/:id', requireAuth, requireVendedor, async (req, res) => {
    const cantidad = parseInt(req.body.cantidad, 10);
    if (isNaN(cantidad) || cantidad <= 0) return res.redirect(`/?err=Cantidad inválida`);

    try {
        const producto = await Producto.findById(req.params.id);
        if (!producto) return res.redirect(`/?err=Producto no existe`);
        
        if (producto.cantidad < cantidad) return res.redirect(`/?err=Stock insuficiente`);

        const total = producto.precio * cantidad;
        
        const nuevaVenta = new Venta({
            productosVendidos: [{
                productoID: producto._id,
                nombre: producto.nombre,
                precioUnitario: producto.precio,
                cantidad: cantidad,
                subtotal: total
            }],
            totalVenta: total,
            fechaVenta: new Date()
        });
        await nuevaVenta.save();

        producto.cantidad -= cantidad;
        await producto.save();

        res.redirect(`/?msg=Venta registrada. Total: $${total.toFixed(2)}`);
    } catch (error) {
        res.redirect(`/?err=Error venta: ${error.message}`);
    }
});

// CREAR PRODUCTO
router.get('/productos/crear', requireAuth, requireAlmacenista, async (req, res) => {
    try {
        const categorias = await Categoria.find().lean();
        res.render('productos/crear_producto', { categorias, producto: null, errores: null });
    } catch (e) { res.redirect(`/?err=Error carga`); }
});

router.post('/productos/crear', requireAuth, requireAlmacenista, async (req, res) => {
    try {
        const data = req.body;
        if(parseInt(data.minStock) >= parseInt(data.maxStock)) {
            throw { message: 'El stock mínimo no puede ser mayor o igual al máximo.' };
        }
        await new Producto(data).save();
        res.redirect(`/?msg=Producto creado`);
    } catch (error) {
        const categorias = await Categoria.find().lean();
        res.render('productos/crear_producto', { categorias, errores: { nombre: { message: error.message } }, producto: req.body });
    }
});

router.post('/productos/eliminar/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await Producto.findByIdAndDelete(req.params.id);
        res.redirect(`/?msg=Producto eliminado`);
    } catch (e) { res.redirect(`/?err=Error eliminar`); }
});

// USUARIOS Y PERFIL
router.get('/setup', async (req, res) => {
    try {
        if (await Usuario.findOne({ username: 'admin' })) return res.send('Admin ya existe');
        const hash = bcrypt.hashSync('admin123', 10);
        await new Usuario({ username: 'admin', password: hash, name: 'Admin', role: 'administrador' }).save();
        res.send('Admin creado');
    } catch (e) { res.send(e.message); }
});

router.get('/login', (req, res) => res.render('login', { error: null }));
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await Usuario.findOne({ username });
        if (!user || !bcrypt.compareSync(password, user.password)) return res.render('login', { error: 'Datos incorrectos' });
        req.session.user = { id: user._id, username: user.username, name: user.name, role: user.role, fotoPerfil: user.fotoPerfil };
        res.redirect('/dashboard');
    } catch (e) { res.render('login', { error: 'Error server' }); }
});
router.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

router.get('/dashboard', requireAuth, (req, res) => res.render('dashboard'));
router.get('/admin/panel', requireAuth, requireAdmin, (req, res) => res.render('admin/panel'));

router.get('/perfil', requireAuth, async (req, res) => {
    try { const u = await Usuario.findById(req.session.user.id); res.render('perfil', { usuario: u }); } catch (e) { res.redirect('/dashboard'); }
});
router.post('/perfil/actualizar', requireAuth, upload.single('foto'), async (req, res) => {
    try {
        const u = await Usuario.findById(req.session.user.id);
        if (req.file) {
            if (u.fotoPerfil !== 'default.png' && fs.existsSync(path.join(__dirname, '../public/uploads', u.fotoPerfil))) fs.unlinkSync(path.join(__dirname, '../public/uploads', u.fotoPerfil));
            u.fotoPerfil = req.file.filename;
        }
        if(req.body.name) u.name = req.body.name;
        await u.save();
        req.session.user.name = u.name; req.session.user.fotoPerfil = u.fotoPerfil;
        res.redirect('/perfil?msg=Actualizado');
    } catch (e) { res.redirect('/perfil?err=Error'); }
});

router.post('/perfil/eliminar-foto', requireAuth, async (req, res) => {
    try {
        const u = await Usuario.findById(req.session.user.id);
        if (u.fotoPerfil && u.fotoPerfil !== 'default.png') {
            const ruta = path.join(__dirname, '../public/uploads', u.fotoPerfil);
            if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
            u.fotoPerfil = 'default.png'; await u.save(); req.session.user.fotoPerfil = 'default.png';
        }
        res.redirect('/perfil?msg=Foto eliminada');
    } catch (error) { res.redirect('/perfil?err=Error'); }
});

// CATEGORIAS
router.get('/categorias', requireAuth, async (req, res) => {
    const c = await Categoria.find().lean(); res.render('categorias/listado_categorias', { categorias: c, mensaje: req.query.msg, error: req.query.err });
});
router.get('/categorias/crear', requireAuth, requireAlmacenista, (req, res) => res.render('categorias/crear_categoria', { error: null, categoria: null }));
router.post('/categorias/crear', requireAuth, requireAlmacenista, async (req, res) => {
    try { await new Categoria(req.body).save(); res.redirect('/categorias?msg=Creada'); } catch (e) { res.render('categorias/crear_categoria', { error: 'Error', categoria: req.body }); }
});

export default router;
