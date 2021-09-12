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
const stripe = require('stripe')(process.env.STRIPE_KEY);

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
    quantity: { type: Number },
  }],
  discount: { type: Number, default: 0 },
});
const Cart = mongoose.model('Cart', CartSchema);

const FavouriteSchema = mongoose.Schema({
  userId: { type: String, default: '' },
  items: [{
    itemId: { type: String },
    quantity: { type: Number },
  }],
  purchaseCount: { type: Number, default: 0 },
  lastModified: { type: Date, default: Date.now() },
});
const Favourite = mongoose.model('Favourite', FavouriteSchema);

const OrderSchema = mongoose.Schema({
  orderStatus: { type: Number, default: 1 },
  userId: { type: String, default: '' },
  items: [{
    itemId: { type: String },
    itemName: { type: String },
    itemPrice: { type: Number },
    quantity: { type: Number },
  }],
  total: { type: Number, default: 0 },
  paymentDetails: {
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: {
      street1: { type: String, default: '' },
      street2: { type: String, default: '' },
      city: { type: String, default: '' },
    },
    stripe: {
      id: { type: String, default: '' },
      timestamp: { type: Date, default: Date.now() },
      status: { type: String, default: '' },
    },
    notes: { type: String, default: '' },
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
  if (req.user) {
    res.locals.data.user = req.user;
    Cart.findOne({ userId: req.user._id }).exec((err, result) => {
      const itemIds = [];
      const cart = [];
      result.items.forEach((lineItem) => {
        itemIds.push(lineItem.itemId);
      });
      Item.find().where('_id').in(itemIds).exec((err2, result2) => {
        result.items.forEach((lineItem) => {
          // eslint-disable-next-line eqeqeq
          const itemMatch = result2.find((dbItem) => dbItem._id == lineItem.itemId);
          cart.push({
            id: lineItem._id,
            itemId: itemMatch._id,
            name: itemMatch.name,
            categoryId: itemMatch.categoryId,
            description: itemMatch.description,
            price: itemMatch.price,
            image: itemMatch.image,
            quantity: lineItem.quantity,
          });
        });
        res.locals.data.cart = cart;
        res.locals.data.cart.discount = result.discount;
        next();
      });
    });
  } else {
    next();
  }
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
    User.findOne({ code: req.body.code }).exec((refErr, refRes) => {
      let bonusPoints = 0;
      if (refErr) {
        console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${refErr.message}`);
      } else {
        bonusPoints += 25;
        const refPoints = refRes.points;
        User.findOneAndUpdate({
          code: req.body.code,
        }, {
          points: refPoints + 25,
        }).exec();
      }
      User.register(new User({
        username: req.body.email,
        email: req.body.email,
        role: count > 0 ? req.body.role || 1 : 4, // Init User Admin > Provided Role > Default Role
        code: bonusPoints,
      }), req.body.password, (err, user) => {
        if (err) {
          console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
          return res.send({
            icon: 'error',
            title: 'Error',
            text: err.message,
          });
        }
        Cart.create({
          userId: user._id,
          items: [],
        }, () => {
          Favourite.create({
            userId: user._id,
            items: [],
            purchaseCount: 0,
            lastModified: new Date(0),
          }, () => {
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
  Order.find({ userId: req.user._id }).exec((err, result) => {
    if (err) {
      console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
      res.locals.data.orders = [];
    } else {
      res.locals.data.orders = result;
    }
    Favourite.findOne({ userId: req.user._id }).exec((err2, result2) => {
      const itemIds = [];
      const items = [];
      result2.items.forEach((lineItem) => {
        itemIds.push(lineItem.itemId);
      });
      Item.find().where('_id').in(itemIds).exec((err3, result3) => {
        result2.items.forEach((lineItem) => {
          // eslint-disable-next-line eqeqeq
          const itemMatch = result3.find((dbItem) => dbItem._id == lineItem.itemId);
          items.push({
            itemId: itemMatch._id,
            itemName: itemMatch.name,
            itemPrice: itemMatch.price,
            quantity: lineItem.quantity,
          });
        });
        res.locals.data.favourite = result2;
        res.locals.data.favouriteItems = items;
        res.render('front/profile');
      });
    });
  });
});

// Homepage
app.get('/', (req, res) => {
  Item.find().exec((err, items) => {
    res.locals.data.products = items;
    res.render('front/index');
  });
});

// Auth
app.get('/login', (req, res) => {
  res.render('front/auth');
});

// Menu
app.get('/menu', (req, res) => {
  let dbQuery = {};
  if (req.query.s) {
    dbQuery = {
      $or: [
        { name: new RegExp(req.query.s, 'i') },
        { description: new RegExp(req.query.s, 'i') },
      ],
    };
  }
  Item.find(dbQuery).exec((err, result) => {
    res.locals.data.menuData = result;
    res.render('front/list');
  });
});

app.get('/menu/:category', (req, res) => {
  Category.findOne({ slug: req.params.category }).exec((err, result) => {
    const categoryId = result._id;
    Item.find({ categoryId }).exec((iErr, products) => {
      res.locals.data.menuData = products;
      res.render('front/list');
    });
  });
});

app.get('/item/:id', (req, res) => {
  Item.findById(req.params.id).exec((err, product) => {
    Category.findById(product.categoryId).exec((err2, category) => {
      Item.find({ categoryId: category.id }).exec((err3, items) => {
        res.locals.data.product = product;
        res.locals.data.items = items.sort(() => Math.random() - 0.5).slice(0, 4);
        res.locals.data.category = category;
        res.render('front/details');
      });
    });
  });
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

app.post('/api/favourite/update', (req, res) => {
  Cart.findOne({ userId: req.user.id }).exec((err, result) => {
    const cart = result;
    Favourite.findOne({ userId: req.user._id }).exec((err2, fav) => {
      if (err2) {
        console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err2.message}`);
        res.send({
          icon: 'error',
          title: 'Error',
          text: err2.message,
        });
      } else {
        // eslint-disable-next-line no-param-reassign
        fav.items = cart.items;
        // eslint-disable-next-line no-param-reassign
        fav.lastModified = Date.now();
        fav.save();
        res.send({
          icon: 'success',
          title: 'Success',
          text: 'Favourite Order Updated.',
        });
      }
    });
  });
});

app.post('/api/favourite/purchase', (req, res) => {
  Cart.findOne({ userId: req.user.id }).exec((err, cart) => {
    Favourite.findOne({ userId: req.user._id }).exec((err2, fav) => {
      if (err2) {
        console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err2.message}`);
        res.send({
          icon: 'error',
          title: 'Error',
          text: err2.message,
        });
      } else {
        // eslint-disable-next-line no-param-reassign
        cart.items = fav.items;
        const dis = Math.floor(fav.purchaseCount / 5);
        // eslint-disable-next-line no-param-reassign
        cart.discount = (dis <= 10) ? dis : 10;
        // eslint-disable-next-line no-param-reassign
        cart.save();
        res.send({
          icon: 'success',
          title: 'Success',
          text: `Favourite Order loaded with ${(dis <= 10) ? dis : 10}% Discount applied.`,
        });
      }
    });
  });
});

app.get('/api/favourite', (req, res) => {
  Favourite.findOne({ userId: req.user._id }).exec((err, fav) => {
    res.send(fav);
  });
});

app.post('/api/cart/add', (req, res) => {
  Cart.findOne({ userId: req.user.id }).exec((err, result) => {
    let cart = result;
    if (!result) {
      cart = {
        userId: req.user.id,
        items: [],
      };
    }
    cart.discount = 0;
    cart.items.push({
      itemId: req.body.id,
      quantity: Number.parseInt(req.body.quantity, 10),
    });
    Cart.updateOne({
      userId: req.user.id,
    }, cart, {
      upsert: true,
      setDefaultsOnInsert: true,
    }, (err2) => {
      if (err) {
        console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
        res.send({
          icon: 'error',
          title: 'Error',
          text: err2.message,
        });
      } else {
        res.send({
          icon: 'success',
          title: 'Success',
          text: 'Added Item to cart',
        });
      }
    });
  });
});

app.post('/api/cart/delete', (req, res) => {
  Cart.findOne({
    userId: req.user.id,
  }).exec((err, result) => {
    const cart = result;
    // eslint-disable-next-line eqeqeq
    const items = cart.items.filter((item) => item._id != req.body.id);
    cart.items = items;
    cart.discount = 0;
    Cart.updateOne({
      userId: req.user.id,
    }, cart, (err2) => {
      if (err) {
        console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
        res.send({
          icon: 'error',
          title: 'Error',
          text: err2.message,
        });
      } else {
        res.send({
          icon: 'success',
          title: 'Success',
          text: 'Deleted Item from cart',
        });
      }
    });
  });
});

app.get('/checkout', (req, res) => {
  Cart.findOne({ userId: req.user._id }).exec((err, result) => {
    const itemIds = [];
    const cart = [];
    result.items.forEach((lineItem) => {
      itemIds.push(lineItem.itemId);
    });
    Item.find().where('_id').in(itemIds).exec((err2, result2) => {
      result.items.forEach((lineItem) => {
        // eslint-disable-next-line eqeqeq
        const itemMatch = result2.find((dbItem) => dbItem._id == lineItem.itemId);
        cart.push({
          id: lineItem._id,
          itemId: itemMatch._id,
          name: itemMatch.name,
          categoryId: itemMatch.categoryId,
          description: itemMatch.description,
          price: itemMatch.price,
          image: itemMatch.image,
          quantity: lineItem.quantity,
        });
      });
      const total = cart.reduce((a, b) => a + (b.price * b.quantity), 0) // All [Price * Quantity]
        * ((100 - result.discount) / 100) // Discount Application
        * 100; // Convert $ to cents for Stripe API
      stripe.paymentIntents.create({
        amount: total,
        currency: 'usd',
        metadata: { integration_check: 'accept_a_payment' },
      }).then((paymentIntent) => {
        res.render('front/checkout', {
          client_secret: paymentIntent.client_secret,
        });
      });
    });
  });
});

app.get('/order-complete/:id', (req, res) => {
  Order.findOne({
    userId: req.user.id,
    _id: req.params.id,
  }).exec((err, result) => {
    res.locals.data.order = result;
    res.render('front/order-complete');
  });
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

// CRM - Orders
app.get('/crm/orders', (req, res) => {
  res.render('crm/orders_list');
});

app.get('/api/orders', (req, res) => {
  Order.find({}).exec((err, result) => {
    res.send(result);
  });
});

app.post('/api/orders/new', (req, res) => {
  Cart.findOne({ userId: req.user._id }).exec((err, result) => {
    const itemIds = [];
    const items = [];
    result.items.forEach((lineItem) => {
      itemIds.push(lineItem.itemId);
    });
    Item.find().where('_id').in(itemIds).exec((err2, result2) => {
      result.items.forEach((lineItem) => {
        // eslint-disable-next-line eqeqeq
        const itemMatch = result2.find((dbItem) => dbItem._id == lineItem.itemId);
        items.push({
          itemId: itemMatch._id,
          itemName: itemMatch.name,
          itemPrice: itemMatch.price,
          quantity: lineItem.quantity,
        });
      });
      Order.create({
        orderStatus: 1,
        userId: req.user._id,
        items,
        // eslint-disable-next-line max-len
        total: items.length > 1
          ? items.reduce((a, b) => a + (b.price * b.quantity), 0) * ((100 - result.discount) / 100)
          : items[0].itemPrice * items[0].quantity * ((100 - result.discount) / 100),
        paymentDetails: req.body,
      }, (err3, order) => {
        if (err3) {
          console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err3.message}`);
          res.send({
            icon: 'error',
            title: 'Error',
            text: err3.message,
          });
        } else {
          Cart.updateOne({ userId: req.user._id }, { items: [], discount: 0 }, (err4) => {
            if (err4) {
              console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err4.message}`);
              res.send({
                icon: 'error',
                title: 'Error',
                text: err4.message,
              });
            } else {
              User.findById(req.user._id).exec((err5, userDoc) => {
                if (err5) {
                  console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err5.message}`);
                  res.send({
                    icon: 'error',
                    title: 'Error',
                    text: err5.message,
                  });
                } else {
                  // eslint-disable-next-line no-param-reassign
                  userDoc.points += order.total;
                  userDoc.save();
                  res.send({
                    orderId: order._id,
                    status: {
                      icon: 'success',
                      title: 'Success',
                      text: 'Payment Successful! Order Receipt Generated.',
                    },
                  });
                }
              });
            }
          });
        }
      });
    });
  });
});

app.get('/api/order/:id', (req, res) => {
  Order.findById(req.params.id).exec((err, result) => {
    if (err) {
      console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${err.message}`);
      res.send({
        icon: 'error',
        title: 'Error',
        text: err.message,
      });
    } else {
      res.send({
        order: result,
        status: {
          icon: 'success',
          title: 'Success',
          text: 'Order Found.',
        },
      });
    }
  });
});

app.post('/api/order/edit', (req, res) => {
  Order.findByIdAndUpdate(req.body.id, {
    orderStatus: req.body.orderStatus,
  }, (err) => {
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
        text: 'Updated Order Status',
      });
    }
  });
});

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
  res.render('crm/analytics');
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

app.post('/api/user/edit', (req, res) => {
  User.findByIdAndUpdate(req.user._id, {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    phone: req.body.phone,
    avatar: req.body.avatar,
    address: {
      street1: req.body.address.street1,
      street2: req.body.address.street2,
      city: req.body.address.city,
    },
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
        text: `Updated ${result.username}`,
      });
    }
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
