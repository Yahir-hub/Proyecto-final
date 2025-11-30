import mongoose from 'mongoose';

const productoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: [true, 'El nombre es obligatorio.'],
        trim: true,
        index: true // Indexado para búsquedas rápidas
    },
    precio: {
        type: Number,
        required: [true, 'El precio es obligatorio.'],
        min: 0
    },
    cantidad: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    // REQUERIMIENTO 4: Stock Mínimo y Máximo
    minStock: {
        type: Number,
        default: 5,
        min: 0
    },
    maxStock: {
        type: Number,
        default: 100,
        min: 1
    },
    categoriaID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Categoria',
        required: true
    }
}, {
    timestamps: true
});

const Producto = mongoose.model('Producto', productoSchema);
export default Producto;