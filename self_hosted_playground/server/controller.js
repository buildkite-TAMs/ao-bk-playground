const labelcoll = require('./schemas/app-schema')
const imagecoll = require('./schemas/image-schema')
const axios = require('axios')
const dotenv = require('dotenv')
const mongoose = require('mongoose')

dotenv.config()

const url = `https://api.nasa.gov/planetary/apod?api_key=${process.env.API_TOKEN}`
console.log(url)

/** Image Collection Transactions */

getImage = async(req, response) => {
  console.log('**** GETTING IMAGE ****')

    const res = await axios.get(url);
    if (!res){
      console.error(`400 in createUser`)
      return response
        .status(400)
        .json({
          success: false,
          error: "Input Incorrect Data"
        });
    }
    const checkImg =  await imagecoll.findOne({"image_path": res.data.url}).lean()
    if (!checkImg) {
      const obj = {
        total_ratings: 0,
        image_path: res.data.url
      }
      const img = new imagecoll(obj);
      return img
      .save()
      .then((saved) =>{
        if (saved) {
          console.log(`202 in getImage, the following image record was created: ${img}`)
          return response
            .status(200)
            .json({
              success: true,
              item: img
            })
        };
      })
    } else {
      console.log("Skipping image insertion, this image already exists in the db", res.data)
      return response
        .status(200)
        .json({
          success: true,
          item : res.data.url,
          message: "This Image Already Exists in the DB"
        })
    }
}
/** User Collection Transactions */
getUser = async(req, response) => {
  console.log('**** GETTING USER ****')
  await labelcoll.find({_id: req.params.id}, (error, user)=>{
    if (error) {
      console.log(`400 in getUser: ${error}`)
      return response
        .status(400)
        .json({
          success: false,
          error: error
        })
    } if (!user.length) {
      console.error(`404 in getUser: User not found`)
      return response
        .status(404)
        .json({
          success: false,
          error: 'Document Not Found'
        });
    };
    console.log(`200 in getUser: document with id ${req.params.id} has been fetched`)
    return response
      .status(200)
      .json({
        success: true,
        item: user
      })
  })
}

createUser = async(req, response) => {
  console.log('**** CREATING NEW USER ****')
  const body = req.body;
  if (!body || body.email.length === 0 ) {
    console.error(`400 in createUser`)
    return response
      .status(400)
      .json({
        success: false,
        error: "Incorrect input data"
      });
  };
  // check if user already exists, if exists it will look for a new
  // image for rating
  const findUserExists = await labelcoll.findOne({email: req.body.email})
  if (findUserExists) {
    console.log('User already exists, checking if new image exists for rating...')
    const newId = await imagecoll.findOne({}).sort({_id: -1})
    const userImageIds = await labelcoll.distinct('image_id', {email: req.body.email})
    for (i of userImageIds) {
      if (!i.equals(newId._id)) {
      let obj = {
        email: req.body.email,
        image_id: newId._id,
        rating: 0
      }
      const newImageForUser =  new labelcoll(obj)
      if (!newImageForUser) {
        console.error(`400 in createNewImageForUser, document is malformed`)
        return response
          .status(400)
          .json({
            success: false,
            message: "Document is malformed"
          })
      };
      return response
        .status(200)
        .json({
          success: true,
          item: newImageForUser,
          message: "A new image was found for rating for existing user"
        })
      }
      return response
      .status(400)
      .json({
        success: false,
        error: "User already exists, and no new image for rating was found"
      })
    }
  }
  // Find the latest image fetched and add to new user for review
  const ids = await imagecoll.findOne({}).sort({_id:-1})
  let obj = {}
  if (ids){
    obj = {
      email: req.body.email,
      image_id: mongoose.Types.ObjectId(ids._id) ,
      rating: 0
    }
  } else {
      obj = {
        email: req.body
      }
  }
  // Create new user
  const user = new labelcoll(obj);
  if (!user) {
    console.error(`400 in createUser, user document is malformed`)
    return response
      .status(400)
      .json({
        success: false,
        message: "Document is malformed"
      })
  };
  return user
    .save()
    .then((saved) =>{
      if(saved) {
        console.log(`202 in createUser, the following user was created: ${user}`)
        return response
          .status(200)
          .json({
            success: true,
            item: user
          })
      };
    })
    .catch(err => {
      console.error(`caught error in createUser: ${err}`);
      Object.keys(err.errors).forEach(errorKey => {
        console.error(`[ERROR] for: ${errorKey}`);
        console.error(`=> ${(err.errors[errorKey] || {}).properties || {}.message}`)
      })
    })
}

updateRating = async(req, response) => {
  console.log("**** UPDATING RATING ****")
  const { body, params } = req || {};
  console.log('body: ', body);
  console.log('params: ', params);

  if(!body) {
    console.error(`400 in updateUser: you must provide an user to update`)
    return response
      .status(400)
      .json({
        success: false,
        error: "You must provide an item to update"
      });
  }
  if (body.rating < 0 || body.rating > 5 || typeof body.rating != 'number') {
    return response
      .status(400)
      .json({
        success: false,
        error: "Ratings must be numbers between 0 and 5"
      })
  }
  const ratingForUpdate = {
    rating: body.rating
  };
  console.log('ratingForUpdate: ', ratingForUpdate);
  await imagecoll.findOneAndUpdate({_id: params.image_id},
    {$inc : {rating: ratingForUpdate.rating }})

  await labelcoll.findOneAndUpdate({_id: params.id, image_id: params.image_id },
        {$set: {rating: ratingForUpdate.rating}},
      (err, writeOpRes) => {
    if (err) {
      console.error(`updateUser: user not found`)
      console.error(err)
      return response
        .status(404)
        .json({
          success: false,
          error: err,
          message: 'User not found'
        });
    };
    console.log(writeOpRes);
    return writeOpRes
  })
  .clone()
  .then(result => {
    console.log(`User's ${req.params.id} rating updates :${ratingForUpdate.rating}`)
    return response
      .status(200)
      .json({
        success: true,
        item: ratingForUpdate,
        message: "Rating updated"
      });
  })
  .catch(err => {
    console.error(`caught error in updateRating: ${err}`);
    Object.keys(err.errors).forEach(errorKey => {
      console.error(`[ERROR] for: ${errorKey}`);
      console.error(`=> ${(err.errors[errorKey] || {}).properties || {}.message}`)
    })
  })
};

deleteUser = async(req, response) => {
  console.log('**** DELETING USER ****')
  await labelcoll.findByIdAndDelete({_id: req.params.id}, (err, user) => {
    if(err) {
      console.error(`400 in deleteUser: ${err}`);
      return response
        .status(400)
        .json({
          success: false,
          error: err
        });
    };
    return user
     })
     .clone()
     .then(result => {
      console.log(`Document with _id : ${req.params.id}, has been deleted`)
      return response
      .status(200)
      .json({
          success: true,
          item: req.params.id,
          message: 'User has been deleted'
      })
    })
  .catch(err => {
    console.error(`caught error in deleteUser: ${err}`);
    Object.keys(err.errors).forEach(errorKey => {
      console.error(`[ERROR] for: ${errorKey}`);
      console.error(`=> ${(err.errors[errorKey] || {}).properties || {}.message}`)
    })
  });
};

getUserRatings = async(req, response) => {
  console.log('**** GETTING USER RATINGS ****')
  let obj = {}
  await labelcoll.find({email: req.body.email}, (error, user) => {
    if (error) {
      console.log(`400 in getUserRatings: ${error}`)
      return response
        .status(400)
        .json({
          success: false,
          error: error
        })
    } if (!user.length) {
      console.error(`404 in getUser: User not found`)
      return response
        .status(404)
        .json({
          success: false,
          error: 'Document Not Found'
        });
    };
    console.log(`Ratings for user ${req.body.email} have been retrieved` )
    return user
  })
  .clone()
  .then((result) => {
    for (i of result){
      obj[i.image_id] = i.rating
    }
    return response
      .status(200)
      .json({
        success: true,
        images:  obj,
        user:  req.body.email,
        message: "User ratings per image have been retrieved"
      })
  })
};

module.exports = {
  getImage,
  getUser,
  updateRating,
  createUser,
  deleteUser,
  getUserRatings
}