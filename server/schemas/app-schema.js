const mongoose = require('mongoose');
const Schema = mongoose.Schema;


var ObjectId = Schema.ObjectId

let appSchema = new Schema(
  {
    email: {
      type: String,
      required:true
    },
    image_id: {
      type: ObjectId,
      required: false
    },
    rating: {
      type: Number,
      required: false
    },
  },
  {
    timestamps: true
  }
)

const LabelColl = mongoose.model("labelcoll", appSchema)
module.exports = LabelColl;