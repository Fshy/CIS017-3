require('dotenv').config();
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
  useFindAndModify: true,
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
  usernameCase: { type: String, required: true },
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
  if (req.user) res.locals.user = req.user;
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN,
  credentials: true,
}));

// Authentication
app.post('/register', (req, res) => {
  db.collection('users').countDocuments((dbErr, count) => {
    if (dbErr) {
      console.log(`${chalk.greenBright('[SERVER]')} ${chalk.redBright('[ERROR]')} ${dbErr.message}`);
      return res.send({
        icon: 'error',
        title: 'Error',
        text: dbErr.message,
      });
    }
    User.register(new User({
      username: req.body.username,
      usernameCase: req.body.username,
      email: req.body.email,
      role: count > 0 ? req.body.role || 0 : 4, // Initial User Admin > Provided Role > Default Role
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
          text: `Logged in as ${user.usernameCase}`,
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
      text: `Logged in as ${req.user.usernameCase}`,
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

app.get('/', (req, res) => {
  res.send('API Server Online');
});

app.get('*', (req, res) => {
  res.send({
    icon: 'error',
    title: 'Error',
    text: 'Failed to fetch API endpoint',
  });
});

app.listen(process.env.SERVER_PORT || 8000, () => {
  console.log(`${chalk.greenBright('[SERVER]')} Started listening on *:${process.env.SERVER_PORT || 8000}`);
});
