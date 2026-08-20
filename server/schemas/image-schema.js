const mongoose = require('mongoose')
const Schema = mongoose.Schema;

let imageSchema = new Schema(
  {
    total_ratings: {
      type: Number,
      require: false
    },
    image_path: {
      type: Object,
      require: false
    }
  }
)

const ImageColl = mongoose.model("imagecoll", imageSchema)
module.exports = ImageColl
