const mongoose = require('mongoose');
const dotenv = require('dotenv')
dotenv.config()

console.log(`==== Mongo Host: ${process.env.MONGO_HOST} ====`)

mongoose
    .connect(process.env.MONGO_HOST, {useUnifiedTopology: true , useNewUrlParser: true })
    .catch(e => {
        console.error('[ERROR] MongoDB connection error', e.message)
    })
const db = mongoose.connection

module.exports = db;