import bcrypt from 'bcryptjs';

// Simulación de base de datos de usuarios
export const users = [
    {
        id: 1,
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        role: 'administrador',
        name: 'Administrador'
    },
    {
        id: 2,
        username: 'usuario',
        password: bcrypt.hashSync('user123', 10),
        role: 'normal',
        name: 'Usuario Normal'
    }
];

export const findUserByUsername = (username) => {
    return users.find(user => user.username === username);
};