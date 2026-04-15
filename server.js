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

const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;

app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: CLIENT_ORIGIN ? [CLIENT_ORIGIN] : true,
  })
);
app.use(express.static(path.join(__dirname, "public")));

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch((err) => console.log(err));

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, minlength: 3, maxlength: 30 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    avatar: { type: String, default: "" },
    bio: { type: String, default: "" },
    tag: { type: String, enum: ["Empresa", "Estudiante", "Indie", ""], default: "" },
    resumeUrl: { type: String, default: "" },
    resumeType: { type: String, default: "" },
    resumeName: { type: String, default: "" },
  },
  { timestamps: true }
);

const postSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    media: { type: String, default: "" },
    userId: { type: String, required: true },
    likes: { type: Number, default: 0 },
    likesUsers: { type: [String], default: [] },
  },
  { timestamps: true }
);

const commentSchema = new Schema(
  {
    postId: { type: String, required: true },
    userId: { type: String, required: true },
    username: { type: String, required: true, trim: true, maxlength: 30 },
    content: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

const messageSchema = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    content: { type: String, required: true, trim: true, maxlength: 500 },
    postId: { type: String, default: "" },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Post = mongoose.models.Post || mongoose.model("Post", postSchema);
const Comment = mongoose.models.Comment || mongoose.model("Comment", commentSchema);
const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "foro-trabajos",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const uploadResume = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
}

function serializeUser(user, options = {}) {
  if (!user) {
    return null;
  }

  const serializedUser = {
    _id: String(user._id),
    username: user.username,
    email: user.email,
    avatar: user.avatar || "",
    bio: user.bio || "",
    tag: user.tag || "",
  };

  if (options.includePrivate) {
    serializedUser.resumeUrl = user.resumeUrl || "";
    serializedUser.resumeType = user.resumeType || "";
    serializedUser.resumeName = user.resumeName || "";
  }

  return serializedUser;
}

async function uploadResumeToCloudinary(file) {
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

  return cloudinary.uploader.upload(dataUri, {
    folder: "foro-trabajos-resumes",
    resource_type: "auto",
    use_filename: true,
    unique_filename: true,
    filename_override: path.parse(file.originalname).name,
  });
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

function isStrongPassword(password) {
  return password.length >= 6 && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

async function auth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).send("No autorizado");
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).send("Usuario no encontrado");
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).send("Token invalido");
  }
}

async function buildPostsResponse(posts, currentUserId = "") {
  const authorIds = [...new Set(posts.map((post) => post.userId).filter(Boolean))];
  const postIds = posts.map((post) => String(post._id));
  const validAuthorIds = authorIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

  const [authors, commentCounts] = await Promise.all([
    validAuthorIds.length
      ? User.find({ _id: { $in: validAuthorIds } }).select("username avatar tag").lean()
      : Promise.resolve([]),
    Comment.aggregate([
      { $match: { postId: { $in: postIds } } },
      { $group: { _id: "$postId", count: { $sum: 1 } } },
    ]),
  ]);

  const authorsMap = new Map(authors.map((author) => [String(author._id), author]));
  const countsMap = new Map(commentCounts.map((item) => [String(item._id), item.count]));

  return posts.map((post) => {
    const author = authorsMap.get(String(post.userId));

      return {
      _id: String(post._id),
      title: post.title,
      description: post.description,
      media: post.media || "",
      userId: String(post.userId),
      likes: post.likes || 0,
      likesUsers: Array.isArray(post.likesUsers) ? post.likesUsers : [],
      createdAt: post.createdAt,
      commentCount: countsMap.get(String(post._id)) || 0,
      likedByCurrentUser: Boolean(
        currentUserId && Array.isArray(post.likesUsers) && post.likesUsers.includes(currentUserId)
      ),
      author: author
        ? {
            _id: String(author._id),
            username: author.username,
            avatar: author.avatar || "",
            tag: author.tag || "",
          }
        : {
            _id: String(post.userId),
            username: "Usuario",
            avatar: "",
            tag: "",
          },
    };
  });
}

function buildMessageResponse(message, currentUserId, usersMap) {
  return {
    _id: String(message._id),
    from: String(message.from),
    to: String(message.to),
    content: message.content,
    postId: message.postId || "",
    createdAt: message.createdAt,
    isOwn: String(message.from) === String(currentUserId),
    fromUser: serializeUser(usersMap.get(String(message.from))),
    toUser: serializeUser(usersMap.get(String(message.to))),
  };
}

app.post("/register", async (req, res) => {
  try {
    const username = sanitizeText(req.body.username, 30);
    const email = sanitizeText(req.body.email, 80).toLowerCase();
    const password = String(req.body.password || "");

    if (!username || !email || !password) {
      return res.status(400).send("Completa todos los campos");
    }

    if (!isValidEmail(email)) {
      return res.status(400).send("Email invalido");
    }

    if (!isStrongPassword(password)) {
      return res
        .status(400)
        .send("La contrasena debe tener al menos 6 caracteres, 1 mayuscula y 1 numero");
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send("Ya existe una cuenta con ese email");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).send("Error al registrar usuario");
  }
});

app.post("/login", async (req, res) => {
  try {
    const email = sanitizeText(req.body.email, 80).toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).send("Completa todos los campos");
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).send("No existe una cuenta con ese email");
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).send("Contrasena incorrecta");
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).send("Error al iniciar sesion");
  }
});

app.get("/user/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password").lean();

    if (!user) {
      return res.status(404).send("Usuario no encontrado");
    }

    let includePrivate = false;
    const token = getTokenFromRequest(req);

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        includePrivate = String(decoded.id) === String(user._id);
      } catch (error) {
        includePrivate = false;
      }
    }

    res.json(serializeUser(user, { includePrivate }));
  } catch (error) {
    res.status(500).send("Error al obtener usuario");
  }
});

app.put("/user/:id", auth, async (req, res) => {
  try {
    if (String(req.user._id) !== String(req.params.id)) {
      return res.status(403).send("No autorizado");
    }

    const username = sanitizeText(req.body.username, 30);
    const bio = sanitizeText(req.body.bio, 160);
    const allowedTags = new Set(["Empresa", "Estudiante", "Indie", ""]);
    const tag = allowedTags.has(String(req.body.tag || "")) ? String(req.body.tag || "") : "";

    await User.findByIdAndUpdate(req.params.id, {
      username: username || req.user.username,
      bio,
      tag,
    });

    res.send("Perfil actualizado");
  } catch (error) {
    res.status(500).send("Error al actualizar perfil");
  }
});

app.post("/upload-avatar", auth, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No hay imagen");
    }

    await User.findByIdAndUpdate(req.user._id, {
      avatar: req.file.path,
    });

    res.send("Avatar actualizado");
  } catch (error) {
    res.status(500).send("Error al subir avatar");
  }
});

app.post("/upload-resume", auth, uploadResume.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No hay archivo");
    }

    const allowedMimeTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).send("Formato de curriculum no permitido");
    }

    const uploadedResume = await uploadResumeToCloudinary(req.file);

    await User.findByIdAndUpdate(req.user._id, {
      resumeUrl: uploadedResume.secure_url || uploadedResume.url,
      resumeType: req.file.mimetype,
      resumeName: req.file.originalname,
    });

    res.json({
      resumeUrl: uploadedResume.secure_url || uploadedResume.url,
      resumeType: req.file.mimetype,
      resumeName: req.file.originalname,
    });
  } catch (error) {
    res.status(500).send("Error al subir curriculum");
  }
});

app.post("/post", auth, upload.single("media"), async (req, res) => {
  try {
    const title = sanitizeText(req.body.title, 100);
    const description = sanitizeText(req.body.description, 500);

    if (!title || !description) {
      return res.status(400).send("Completa titulo y descripcion");
    }

    const post = await Post.create({
      title,
      description,
      media: req.file ? req.file.path : "",
      userId: String(req.user._id),
    });

    const [responsePost] = await buildPostsResponse([post], String(req.user._id));
    res.status(201).json(responsePost);
  } catch (error) {
    res.status(500).send("Error al publicar");
  }
});

app.get("/posts", async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    let currentUserId = "";

    if (token) {
      try {
        currentUserId = String(jwt.verify(token, JWT_SECRET).id);
      } catch (error) {
        currentUserId = "";
      }
    }

    const posts = await Post.find().sort({ createdAt: -1, _id: -1 }).limit(50).lean();
    const response = await buildPostsResponse(posts, currentUserId);

    res.json(response);
  } catch (error) {
    res.status(500).send("Error al obtener publicaciones");
  }
});

app.get("/posts/user/:userId", async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.params.userId })
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    const response = await buildPostsResponse(posts, req.params.userId);
    res.json(response);
  } catch (error) {
    res.status(500).send("Error al obtener posts");
  }
});

app.post("/like/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).send("Post no encontrado");
    }

    const currentUserId = String(req.user._id);
    if (!Array.isArray(post.likesUsers)) {
      post.likesUsers = [];
    }

    if (post.likesUsers.includes(currentUserId)) {
      return res.status(200).json({
        likes: post.likes,
        alreadyLiked: true,
      });
    }

    post.likesUsers.push(currentUserId);
    post.likes += 1;
    await post.save();

    res.json({
      likes: post.likes,
      alreadyLiked: false,
    });
  } catch (error) {
    res.status(500).send("Error al dar like");
  }
});

app.delete("/post/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).send("Post no encontrado");
    }

    if (String(post.userId) !== String(req.user._id)) {
      return res.status(403).send("No autorizado");
    }

    if (post.media) {
      const fileName = post.media.split("/").pop();
      const publicId = "foro-trabajos/" + fileName.split(".")[0];
      await cloudinary.uploader.destroy(publicId);
    }

    await Promise.all([
      Post.findByIdAndDelete(req.params.id),
      Comment.deleteMany({ postId: req.params.id }),
      Message.deleteMany({ postId: req.params.id }),
    ]);

    res.send("Post eliminado");
  } catch (error) {
    res.status(500).send("Error al eliminar");
  }
});

app.post("/comment", auth, async (req, res) => {
  try {
    const postId = sanitizeText(req.body.postId, 40);
    const content = sanitizeText(req.body.content, 300);

    if (!postId || !content) {
      return res.status(400).send("Comentario incompleto");
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).send("Post no encontrado");
    }

    const comment = await Comment.create({
      postId,
      userId: String(req.user._id),
      username: req.user.username,
      content,
    });

    res.status(201).json({
      _id: String(comment._id),
      postId,
      userId: String(req.user._id),
      username: req.user.username,
      content: comment.content,
      createdAt: comment.createdAt,
      isOwnComment: true,
    });
  } catch (error) {
    res.status(500).send("Error al comentar");
  }
});

app.get("/comments/:postId", async (req, res) => {
  try {
    const comments = await Comment.find({ postId: req.params.postId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .lean();

    res.json(
      comments.map((comment) => ({
        _id: String(comment._id),
        postId: comment.postId,
        userId: comment.userId,
        username: comment.username,
        content: comment.content,
        createdAt: comment.createdAt,
      }))
    );
  } catch (error) {
    res.status(500).send("Error al obtener comentarios");
  }
});

app.get("/comments-count/:postId", async (req, res) => {
  try {
    const count = await Comment.countDocuments({ postId: req.params.postId });
    res.json({ count });
  } catch (error) {
    res.status(500).send("Error al contar comentarios");
  }
});

app.get("/messages", auth, async (req, res) => {
  try {
    const currentUserId = String(req.user._id);
    const messages = await Message.find({
      $or: [{ from: currentUserId }, { to: currentUserId }],
    })
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    const latestByUser = new Map();

    for (const message of messages) {
      const partnerId =
        String(message.from) === currentUserId ? String(message.to) : String(message.from);

      if (!latestByUser.has(partnerId)) {
        latestByUser.set(partnerId, message);
      }
    }

    const partnerIds = [...latestByUser.keys()];
    const validPartnerIds = partnerIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const users = validPartnerIds.length
      ? await User.find({ _id: { $in: validPartnerIds } }).select("-password").lean()
      : [];
    const usersMap = new Map(users.map((user) => [String(user._id), user]));

    const conversations = [...latestByUser.entries()].map(([partnerId, message]) => ({
      partner: serializeUser(usersMap.get(partnerId)),
      latestMessage: buildMessageResponse(message, currentUserId, usersMap),
    }));

    res.json(conversations);
  } catch (error) {
    res.status(500).send("Error al obtener mensajes");
  }
});

app.get("/messages/:userId", auth, async (req, res) => {
  try {
    const currentUserId = String(req.user._id);
    const partnerId = String(req.params.userId);

    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).send("Usuario no valido");
    }

    const [partner, messages] = await Promise.all([
      User.findById(partnerId).select("-password").lean(),
      Message.find({
        $or: [
          { from: currentUserId, to: partnerId },
          { from: partnerId, to: currentUserId },
        ],
      })
        .sort({ createdAt: 1, _id: 1 })
        .limit(100)
        .lean(),
    ]);

    if (!partner) {
      return res.status(404).send("Usuario no encontrado");
    }

    const usersMap = new Map([
      [currentUserId, req.user.toObject()],
      [partnerId, partner],
    ]);

    res.json({
      partner: serializeUser(partner),
      messages: messages.map((message) => buildMessageResponse(message, currentUserId, usersMap)),
    });
  } catch (error) {
    res.status(500).send("Error al obtener la conversacion");
  }
});

app.post("/message", auth, async (req, res) => {
  try {
    const currentUserId = String(req.user._id);
    const to = sanitizeText(req.body.to, 40);
    const content = sanitizeText(req.body.content, 500);
    const postId = sanitizeText(req.body.postId, 40);

    if (!to || !content) {
      return res.status(400).send("Mensaje incompleto");
    }

    if (to === currentUserId) {
      return res.status(400).send("No puedes enviarte un mensaje a ti mismo");
    }

    const recipient = await User.findById(to).select("-password").lean();
    if (!recipient) {
      return res.status(404).send("Destinatario no encontrado");
    }

    const message = await Message.create({
      from: currentUserId,
      to,
      content,
      postId,
    });

    const usersMap = new Map([
      [currentUserId, req.user.toObject()],
      [to, recipient],
    ]);

    res.status(201).json(buildMessageResponse(message.toObject(), currentUserId, usersMap));
  } catch (error) {
    res.status(500).send("Error al enviar mensaje");
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Servidor corriendo");
});
