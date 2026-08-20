const express = require('express')
const controller = require('./controller')
const router = express.Router();

router.get('/nasaimage', controller.getImage);
router.get('/user/:id', controller.getUser);
router.post('/user', controller.createUser);
router.patch('/user/:id/:image_id', controller.updateRating);
router.delete('/user/:id', controller.deleteUser)
router.get('/ratings', controller.getUserRatings)

module.exports = router;



