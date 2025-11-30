// Middleware base: verifica login
export const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    return res.redirect('/login');
};

// Middleware: Solo Administrador
export const requireAdmin = (req, res, next) => {
    if (req.session?.user?.role === 'administrador') {
        return next();
    }
    return res.status(403).render('error', { message: 'Acceso denegado. Solo Administradores.' });
};

// Middleware: Almacenista O Admin (Para agregar stock/productos)
export const requireAlmacenista = (req, res, next) => {
    const role = req.session?.user?.role;
    if (role === 'administrador' || role === 'almacenista') {
        return next();
    }
    return res.status(403).render('error', { message: 'Acceso denegado. Se requiere rol de Almacenista.' });
};

// Middleware: Vendedor O Admin (Para vender)
export const requireVendedor = (req, res, next) => {
    const role = req.session?.user?.role;
    if (role === 'administrador' || role === 'vendedor') {
        return next();
    }
    return res.status(403).render('error', { message: 'Acceso denegado. Se requiere rol de Vendedor.' });
};

// Pasar usuario a las vistas
export const userMiddleware = (req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
};