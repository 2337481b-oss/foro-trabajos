require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// ☁️ CONFIGURACIÓN CLOUDINARY
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET
});

// 🔌 CONEXIÓN MONGODB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ Conectado a MongoDB"))
.catch(err => console.log(err));

// 📦 MODELOS
const User = mongoose.model("User", {
  username: String,
  email: String,
  password: String
});

const Post = mongoose.model("Post", {
  title: String,
  description: String,
  media: String,
  userId: String,
  likes: { type: Number, default: 0 } // ❤️ agregado
});

const Message = mongoose.model("Message", {
  from: String,
  to: String,
  content: String
});

// 🔐 REGISTRO
app.post("/register", async (req, res) => {

  if (!req.body.email || !req.body.password) {
    return res.status(400).send("Datos incompletos");
  }

  // 🔒 evitar duplicados
  const existingUser = await User.findOne({ email: req.body.email });
  if (existingUser) {
    return res.status(400).send("El usuario ya existe");
  }

  try {
    const hashed = await bcrypt.hash(req.body.password, 10);

    const user = new User({
      username: req.body.username,
      email: req.body.email,
      password: hashed
    });

    await user.save();
    res.send("Usuario registrado");
  } catch (error) {
    console.log(error);
    res.status(500).send("Error al registrar usuario");
  }
});

// 🔑 LOGIN
app.post("/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.send("No existe");

  const valid = await bcrypt.compare(req.body.password, user.password);
  if (!valid) return res.send("Contraseña incorrecta");

  const token = jwt.sign({ id: user._id }, "secreto");
  res.json({ token, user });
});

// 📂 CLOUDINARY STORAGE
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "foro-trabajos",
    allowed_formats: ["jpg", "png", "jpeg"]
  }
});

const upload = multer({ storage });

// 📝 CREAR POST
app.post("/post", upload.single("media"), async (req, res) => {
  try {
    const post = new Post({
      title: req.body.title,
      description: req.body.description,
      media: req.file ? req.file.path : null,
      userId: req.body.userId
    });

    await post.save();
    res.send("Publicación creada");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error al publicar");
  }
});

// 📄 OBTENER POSTS
app.get("/posts", async (req, res) => {
  const posts = await Post.find();
  res.json(posts);
});

// ❤️ LIKE
app.post("/like/:id", async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, {
      $inc: { likes: 1 }
    });
    res.send("Like agregado");
  } catch (err) {
    res.status(500).send("Error al dar like");
  }
});

// 💬 MENSAJES
app.post("/message", async (req, res) => {
  try {
    const msg = new Message(req.body);
    await msg.save();
    res.send("Mensaje enviado");
  } catch (err) {
    res.status(500).send("Error al enviar mensaje");
  }
});

// 🏠 HOME
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🚀 SERVIDOR
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Servidor corriendo");
});