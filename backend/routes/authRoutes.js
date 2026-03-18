const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
const secret = process.env.JWT_SECRET || 'supersecret';

router.post('/register', async (req,res)=>{
  try{
    const {name,email,password} = req.body;         //data tht frontend send to backend
    if(!email||!password) return res.status(400).json({message:'Missing'});
    const exists = await User.findOne({email});
    if(exists) return res.status(400).json({message:'Exists'});         //looks for duplicates
    const hash = await bcrypt.hash(password,10);                      //hashes pswd
    const user = await User.create({name,email,passwordHash:hash});
    const token = jwt.sign({id:user._id, email:user.email, name:user.name}, secret);          //creates jwt token
    res.json({token, user:{_id: user._id, email:user.email, name:user.name}});                     //send data to frontend
  }catch(e){ 
  console.error("REGISTER ERROR:", e);
  res.status(500).json({message:'err'}); 
}

});

router.post('/login', async (req,res)=>{
  try{
    const {email,password} = req.body;
    const user = await User.findOne({email});
    if(!user) return res.status(400).json({message:'Invalid'});           //user not in db
    const ok = await bcrypt.compare(password, user.passwordHash);         //compares pswd w hashed pswd
    if(!ok) return res.status(400).json({message:'Invalid'});
    const token = jwt.sign({id:user._id, email:user.email, name:user.name}, secret);      //creates jwt token
    res.json({token, user:{_id: user._id, email:user.email, name:user.name}});
  }catch(e){ res.status(500).json({message:'err'}); }
});

module.exports = router;
