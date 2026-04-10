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

// ☁️ CLOUDINARY
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET
});

// 🔌 MONGODB
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
  likes: { type: Number, default: 0 }
});

const Comment = mongoose.model("Comment", {
  postId: String,
  username: String,
  content: String,
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", {
  from: String,
  to: String,
  content: String
});

// 🔐 REGISTER
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password)
    return res.status(400).send("Datos incompletos");

  if (password.length < 4)
    return res.status(400).send("Contraseña muy corta");

  const existingUser = await User.findOne({ email });
  if (existingUser)
    return res.status(400).send("El usuario ya existe");

  try {
    const hashed = await bcrypt.hash(password, 10);

    await new User({ username, email, password: hashed }).save();

    res.send("Usuario registrado");
  } catch (err) {
    res.status(500).send("Error al registrar usuario");
  }
});

// 🔑 LOGIN
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(400).send("No existe");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).send("Contraseña incorrecta");

  const token = jwt.sign({ id: user._id }, "secreto", { expiresIn: "7d" });

  res.json({ token, user });
});

// 📂 CLOUDINARY STORAGE
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "foro-trabajos",
    allowed_formats: ["jpg", "png", "jpeg"]
  }
});

const upload = multer({ storage });

// 📝 CREAR POST
app.post("/post", upload.single("media"), async (req, res) => {
  try {
    const { title, description, userId } = req.body;

    if (!title || !description)
      return res.status(400).send("Datos incompletos");

    const post = new Post({
      title: title.slice(0, 100),
      description: description.slice(0, 500),
      media: req.file ? req.file.path : null,
      userId
    });

    await post.save();
    res.send("Publicación creada");

  } catch (err) {
    res.status(500).send("Error al publicar");
  }
});

// 📄 POSTS
app.get("/posts", async (req, res) => {
  const posts = await Post.find().sort({ _id: -1 }).limit(50);
  res.json(posts);
});

// ❤️ LIKE
app.post("/like/:id", async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, {
      $inc: { likes: 1 }
    });
    res.send("Like agregado");
  } catch {
    res.status(500).send("Error al dar like");
  }
});

// 🗑 ELIMINAR POST
app.delete("/post/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).send("Post no encontrado");

    if (post.userId !== req.body.userId)
      return res.status(403).send("No autorizado");

    // eliminar imagen
    if (post.media) {
      const fileName = post.media.split("/").pop();
      const publicId = "foro-trabajos/" + fileName.split(".")[0];
      await cloudinary.uploader.destroy(publicId);
    }

    await Post.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ postId: req.params.id });

    res.send("Post eliminado");

  } catch {
    res.status(500).send("Error al eliminar");
  }
});

// 💬 CREAR COMENTARIO
app.post("/comment", async (req, res) => {
  try {
    const { postId, username, content } = req.body;

    if (!postId || !content)
      return res.status(400).send("Datos incompletos");

    if (content.length > 300)
      return res.status(400).send("Comentario muy largo");

    await new Comment({
      postId,
      username,
      content
    }).save();

    res.send("Comentario agregado");

  } catch {
    res.status(500).send("Error al comentar");
  }
});

// 📄 OBTENER COMENTARIOS
app.get("/comments/:postId", async (req, res) => {
  try {
    const comments = await Comment.find({ postId: req.params.postId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(comments);

  } catch {
    res.status(500).send("Error al obtener comentarios");
  }
});

// 🔢 CONTAR COMENTARIOS (OPTIMIZADO)
app.get("/comments-count/:postId", async (req, res) => {
  try {
    const count = await Comment.countDocuments({
      postId: req.params.postId
    });
    res.json({ count });
  } catch {
    res.status(500).send("Error al contar comentarios");
  }
});

// 💬 MENSAJES
app.post("/message", async (req, res) => {
  try {
    await new Message(req.body).save();
    res.send("Mensaje enviado");
  } catch {
    res.status(500).send("Error al enviar mensaje");
  }
});

// 🏠 HOME
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🚀 SERVER
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Servidor corriendo");
});