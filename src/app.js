/* eslint-disable no-underscore-dangle */
require('dotenv').config();
const path = require('path');
const chalk = require('chalk');
const mongoose = require('mongoose');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const cors = require('cors');
const Hashids = require('hashids');

const app = express();
const hashids = new Hashids(process.env.SESSION_SECRET);

mongoose.connect(`mongodb://${process.env.DB_HOST}/${process.env.DB_NAME}`, {
  useCreateIndex: true,
  useNewUrlParser: true,
  useFindAndModify: false,
  useUnifiedTopology: true,
});
const db = mongoose.connection;

db.on('connected', () => {
  console.log(`${chalk.cyanBright('[DATABASE]')} Connection successful`);
});

db.on('error', (err) => {
  console.log(`${chalk.cyanBright('[DATABASE]')} ${chalk.redBright('[ERROR]')} ${err.reason}`);
});

// Roles
// 1 - Customer
// 2 - Employee
// 3 - Manager
// 4 - Administrator

const UserSchema = mongoose.Schema({
  role: { type: Number, default: 1 },
  joinDate: { type: Date, default: Date.now },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  email: { type: String, default: '', required: true },
  phone: { type: String, default: '' },
  address: {
    street1: { type: String, default: '' },
    street2: { type: String, default: '' },
    city: { type: String, default: '' },
  },
  avatarURL: { type: String, default: 'http://www.gravatar.com/avatar/?d=mp' },
  code: { type: String, default: hashids.encode(Date.now()) },
  points: { type: Number, default: 0 },
});
UserSchema.plugin(passportLocalMongoose, { usernameLowerCase: true });
const User = mongoose.model('User', UserSchema);

const CategorySchema = mongoose.Schema({
  name: { type: String, default: '' },
  slug: { type: String, default: '' },
});
const Category = mongoose.model('Category', CategorySchema);

const ItemSchema = mongoose.Schema({
  name: { type: String, default: '' },
  slug: { type: String, default: '' },
  price: { type: Number, default: 0 },
  categoryId: { type: String, default: '' },
  description: { type: String, default: '' },
  image: { type: String, default: '' },
});
const Item = mongoose.model('Item', ItemSchema);

const CartSchema = mongoose.Schema({
  userId: { type: String, default: '' },
  items: [{
    itemId: { type: String },
    itemPrice: { type: Number },
    quantity: { type: Number },
  }],
  total: { type: Number, default: 0 },
});
const Cart = mongoose.model('Cart', CartSchema);

const OrderSchema = mongoose.Schema({
  orderStatus: { type: String, default: 'Being Prepared' },
  userId: { type: String, default: '' },
  items: [{
    itemId: { type: String },
    itemPrice: { type: Number },
    quantity: { type: Number },
  }],
  deductions: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  paymentDetails: {
    address: {
      street1: { type: String, default: '' },
      street2: { type: String, default: '' },
      city: { type: String, default: '' },
    },
  },
});
const Order = mongoose.model('Order', OrderSchema);

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    client: db.getClient(),
    ttl: 30 * 24 * 60 * 60,
  }),
}));

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.data = { status: 'OK' };
  if (req.user) res.locals.data.user = req.user;
  next();
});

app.use('/public', express.static('./public'));
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN,
  credentials: true,
}));

// Authentication
app.post('/register', (req, res) => {
  db.collection('users').countDocuments((dbErr, count) => { // Check if any user exists in the database
    if (dbErr) {
      console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${dbErr.message}`);
      return res.send({
        icon: 'error',
        title: 'Error',
        text: dbErr.message,
      });
    }
    User.register(new User({
      username: req.body.email,
      email: req.body.email,
      role: count > 0 ? req.body.role || 1 : 4, // Initial User Admin > Provided Role > Default Role
    }), req.body.password, (err, user) => {
      if (err) {
        console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
        return res.send({
          icon: 'error',
          title: 'Error',
          text: err.message,
        });
      }
      req.login(user, (error) => {
        if (error) {
          console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${error.message}`);
          return res.send({
            icon: 'error',
            title: 'Error',
            text: err.message,
          });
        }
        res.send({
          icon: 'success',
          title: 'Success',
          text: `Logged in as ${user.username}`,
        });
      });
    });
  });
});

app.post('/login', (req, res) => {
  passport.authenticate('local')(req, res, () => {
    res.send({
      icon: 'success',
      title: 'Success',
      text: `Logged in as ${req.user.username}`,
    });
  });
});

app.post('/logout', (req, res) => {
  req.logout();
  res.send({
    icon: 'success',
    title: 'Success',
    text: 'Logged out',
  });
});

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

app.post('/user/edit/password', (req, res) => {
  if (!req.user) {
    return res.send({
      icon: 'error',
      title: 'Error',
      text: 'User not authenticated',
    });
  }
  User.findByUsername(req.user.username).then((loggedUser) => {
    if (loggedUser) {
      loggedUser.changePassword(req.body.oldPassword, req.body.newPassword, (err) => {
        if (err) {
          console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
          return res.send({
            icon: 'error',
            title: 'Error',
            text: err.message,
          });
        }
        res.send({
          icon: 'success',
          title: 'Success',
          text: 'Password changed',
        });
      });
    } else {
      res.send({
        icon: 'error',
        title: 'Error',
        text: 'User not found',
      });
    }
  });
});

app.get('/login', (req, res) => {
  res.render('front/auth');
});

app.get('/profile', (req, res) => {
  res.render('front/profile');
});

// Homepage
app.get('/', (req, res) => {
  res.render('front/index');
});

// Auth
app.get('/login', (req, res) => {
  res.render('front/auth');
});

// Menu
app.get('/menu', (req, res) => {
  res.render('front/list');
});

app.get('/menu/:category', (req, res) => {
  res.render('front/list');
});

app.get('/item/:id', (req, res) => {
  res.render('front/details');
});

// Track Delivery
app.get('/track', (req, res) => {
  res.render('front/track');
});

// Store Locator
app.get('/stores', (req, res) => {
  res.render('front/stores');
});

// Promotions
app.get('/promotions', (req, res) => {
  res.render('front/promotions');
});

// Checkout
app.get('/cart', (req, res) => {
  res.render('front/cart');
});

app.get('/checkout', (req, res) => {
  res.render('front/checkout');
});

app.use('/crm/*', (req, res, next) => {
  if (res.locals.data.user) {
    if (res.locals.data.user.role === 1) {
      return res.render('crm/403');
    }
  } else {
    return res.render('crm/403');
  }
  next();
});

app.use('/api/*', (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    if (res.locals.data.user) {
      if (res.locals.data.user.role === 1) {
        return res.send('UNAUTHORIZED');
      }
    } else {
      return res.send('UNAUTHORIZED');
    }
  }
  next();
});

// CRM - Dashboard
app.get('/crm', (req, res) => {
  res.redirect('/crm/orders');
});

// const OrderSchema = mongoose.Schema({
//   orderStatus: { type: String, default: 'Being Prepared' },
//   userId: { type: String, default: '' },
//   items: [{
//     itemId: { type: String },
//     itemPrice: { type: Number },
//     quantity: { type: Number },
//   }],
//   deductions: { type: Number, default: 0 },
//   total: { type: Number, default: 0 },
//   paymentDetails: {
//     address: {
//       street1: { type: String, default: '' },
//       street2: { type: String, default: '' },
//       city: { type: String, default: '' },
//     },
//   },
// });

// CRM - Orders
app.get('/crm/orders', (req, res) => {
  res.render('crm/index');
});

// const ItemSchema = mongoose.Schema({
//   name: { type: String, default: '' },
//   price: { type: Number, default: 0 },
//   categoryId: { type: String, default: '' },
//   description: { type: String, default: '' },
//   image: { type: String, default: '' },
// });
// const Item = mongoose.model('Item', ItemSchema);

// CRM - Products
app.get('/crm/products', (req, res) => {
  if (res.locals.data.user.role < 3) return res.render('crm/403');
  res.render('crm/product_list');
});

app.get('/crm/products/new', (req, res) => {
  if (res.locals.data.user.role < 3) return res.render('crm/403');
  Category.find({}).exec((err, result) => {
    const categoryData = [];
    result.forEach((cat) => {
      categoryData.push({
        name: cat.name,
        id: cat._id,
      });
    });
    res.locals.data.categoryData = categoryData;
    res.render('crm/product_details');
  });
});

app.get('/crm/products/:id', (req, res) => {
  if (res.locals.data.user.role < 3) return res.render('crm/403');
  Category.find({}).exec((err, result) => {
    const categoryData = [];
    result.forEach((cat) => {
      categoryData.push({
        name: cat.name,
        id: cat._id,
      });
    });
    Item.findById(req.params.id).exec((iErr, product) => {
      res.locals.data.categoryData = categoryData;
      res.locals.data.productData = {
        name: product.name,
        slug: product.slug,
        price: product.price,
        categoryId: product.categoryId,
        description: product.description,
        image: product.image,
        _id: product._id,
      };
      res.render('crm/product_details');
    });
  });
});

app.get('/api/products', (req, res) => {
  Category.find({}).exec((err, result) => {
    const categoryData = {};
    result.forEach((cat) => {
      categoryData[cat._id] = { name: cat.name };
    });
    Item.find({}).exec((iErr, iResult) => {
      const sortedOrders = [];
      iResult.forEach((element, index) => {
        sortedOrders.push({
          name: element.name,
          slug: element.slug,
          price: element.price,
          categoryId: element.categoryId,
          category: categoryData[iResult[index].categoryId].name,
          description: element.description,
          image: element.image,
          _id: element._id,
        });
      });
      res.json(sortedOrders);
    });
  });
});

app.post('/api/products/add', (req, res) => {
  Item.create({
    name: req.body.name,
    slug: String(req.body.name).toLowerCase().replace(/ /g, '-').replace(/[-]+/g, '-')
      .replace(/[^\w-]+/g, ''),
    price: Number.parseFloat(req.body.price),
    categoryId: req.body.categoryId ? req.body.categoryId : '',
    description: req.body.description ? req.body.description : '',
    image: req.body.image ? req.body.image : '',
  }, (err, result) => {
    if (err) {
      console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
      res.send({
        icon: 'error',
        title: 'Error',
        text: err.message,
      });
    } else {
      res.send({
        icon: 'success',
        title: 'Success',
        text: `Added ${result.name}`,
      });
    }
  });
});

app.post('/api/products/edit', (req, res) => {
  Item.findByIdAndUpdate(req.body.id, {
    name: req.body.name,
    slug: String(req.body.name).toLowerCase().replace(/ /g, '-').replace(/[-]+/g, '-')
      .replace(/[^\w-]+/g, ''),
    price: Number.parseFloat(req.body.price),
    categoryId: req.body.categoryId ? req.body.categoryId : '',
    description: req.body.description ? req.body.description : '',
    image: req.body.image ? req.body.image : '',
  }, (err, result) => {
    if (err) {
      console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
      res.send({
        icon: 'error',
        title: 'Error',
        text: err.message,
      });
    } else {
      res.send({
        icon: 'success',
        title: 'Success',
        text: `Edited ${result.name}`,
      });
    }
  });
});

app.post('/api/products/delete', (req, res) => {
  Item.findByIdAndDelete(req.body.id, (err, result) => {
    if (err) {
      console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
      res.send({
        icon: 'error',
        title: 'Error',
        text: err.message,
      });
    } else {
      res.send({
        icon: 'success',
        title: 'Success',
        text: `Deleted ${result.name}`,
      });
    }
  });
});

// CRM - Categories
app.get('/crm/categories', (req, res) => {
  if (res.locals.data.user.role < 3) return res.render('crm/403');
  res.render('crm/category_list');
});

app.get('/api/categories', (req, res) => {
  Category.find({}).exec((err, result) => {
    res.json(result);
  });
});

app.post('/api/categories/add', (req, res) => {
  Category.create({
    name: req.body.name,
    slug: String(req.body.name).toLowerCase().replace(/ /g, '-').replace(/[-]+/g, '-')
      .replace(/[^\w-]+/g, ''),
  }, (err, result) => {
    if (err) {
      console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
      res.send({
        icon: 'error',
        title: 'Error',
        text: err.message,
      });
    } else {
      res.send({
        icon: 'success',
        title: 'Success',
        text: `Added ${result.name}`,
      });
    }
  });
});

app.post('/api/categories/edit', (req, res) => {
  Category.findByIdAndUpdate(req.body.id, {
    name: req.body.name,
    slug: String(req.body.name).toLowerCase().replace(/ /g, '-').replace(/[-]+/g, '-')
      .replace(/[^\w-]+/g, ''),
  }, (err, result) => {
    if (err) {
      console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
      res.send({
        icon: 'error',
        title: 'Error',
        text: err.message,
      });
    } else {
      res.send({
        icon: 'success',
        title: 'Success',
        text: `Edited ${result.name}`,
      });
    }
  });
});

app.post('/api/categories/delete', (req, res) => {
  Category.findByIdAndDelete(req.body.id, (err, result) => {
    if (err) {
      console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
      res.send({
        icon: 'error',
        title: 'Error',
        text: err.message,
      });
    } else {
      res.send({
        icon: 'success',
        title: 'Success',
        text: `Deleted ${result.name}`,
      });
    }
  });
});

// CRM - Analytics
app.get('/crm/analytics', (req, res) => {
  if (res.locals.data.user.role < 3) return res.render('crm/403');
  res.render('crm/index');
});

// CRM - Users
app.get('/crm/users', (req, res) => {
  if (res.locals.data.user.role < 4) return res.render('crm/403');
  res.render('crm/user_list');
});

app.get('/api/users', (req, res) => {
  User.find({}).exec((err, result) => {
    const output = [];
    result.forEach((user) => {
      output.push({
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        points: user.points,
        role: user.role,
      });
    });
    res.json(output);
  });
});

// Wildcards
app.get('/crm/*', (req, res) => {
  res.render('crm/404');
});

app.get('*', (req, res) => {
  res.render('front/404');
});

app.listen(process.env.SERVER_PORT || 8080, () => {
  console.log(`${chalk.greenBright('[SERVER]')} Started listening on *:${process.env.SERVER_PORT || 8080}`);
});
