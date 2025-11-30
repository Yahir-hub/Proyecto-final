import mongoose from 'mongoose';

const usuarioSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    // REQUERIMIENTO 7 y 8: Roles específicos
    role: { 
        type: String, 
        enum: ['administrador', 'almacenista', 'vendedor'], 
        default: 'vendedor' 
    },
    fotoPerfil: { type: String, default: 'default.png' }
}, { timestamps: true });

const Usuario = mongoose.model('Usuario', usuarioSchema);
export default Usuario;