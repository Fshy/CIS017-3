**PRESENTATION NOTES**

# Database Preview

- Go over every database table
- Sessions table - this was not included as part of the ERD, but is automatically generated through our session storage library. This collection stores the session cookies of the logged in users.

# Landing Page

- This is the first point of contact for the customer, and they are presented with all the navigational elements expected of a modern website.
- The customer is greeted with a carousel image slider presenting visually attractive promotional material.
- Below the fold, there are more promotional items with links navigating the user to their respective pages.
- And right below that we have links to new products which may appeal to the customer on first visit.

Lets head back up to the navbar and move on to the product listing, or as its referred to here the menu.

# Menu

- Here we have a listing of all the products on the site with their name, an excerpt and price.
- On the left sidebar we have a category filter which lets the customer more easily browse products they are interested in.
- The navigation bar above effectively performs the same action, remaining accessible throughout the different application views.
- The search functionality here performs a fuzzy logic query on either the name or the description of an item, I can show the Mongo query for this it accepts a string and builds a regular expression.
- `Search chicken` as you can see it performs a lookup across all products and categories and finds us any items with chicken.
- **IGNORE** `tinysort('ul>li', '.amount')` The sorting filter at the top is pretty straight-forward as it just reorders the layout of the listing.

# Product Details

- Here we have all the standard elements of a details page, the in-your-face product image, the name, description, and price.
- Below we have recommendations based on the item selected.
- The breadcrumbs at the top let the customer move backwards in navigation at any time.
- Here we can adjust the quantity and add the item to cart.

# Authentication

- Here we encounter a roadblock, where the customer is required to have an account to use the cart or checkout.
- Ideally we would have let the the user manage their cart without authentication using the browser web storage API, but due to time constraints the implementation of the cart as a database table was simpler, but this required a user account to exist.
- While we're here we can either register with an optional referral code, or login. The referral code grants both the new user, and the referring user a 25 point bonus.
- Logging in with the customer profile, `customer@mail.com` we are informed by the system that we entered the **wrong password**.
- Entering the right password here, it lets us know that it was successful, and are redirected away from the page.

# Cart

- Here we navigate back to our items and add them to the cart.
- On this page we have a visual identifier of our progress in the checkout process.
- The ability to remove items from the cart, and the totals of the cart.
- Before continuing with the checkout process, lets take a look at some of the gamification aspects of the application.

# My Account

- As you can see we have more pages available to a logged in user, and we will navigate to the user account page.
- Here the user can edit their personal details, view order history, and their favourite order.
- The favourite order is a wishlist item that a user can set and repurchase at any time. Continuous purchases of their favourite order grants the user stacking discounts over time.
- The reward points listed on the user page are the cornerstone of how all gamification systems are interconnected through the system. All positive feedback interactions grant the user these reward points, such as referrals and purchases.

# Promos

- In the promotional tab, here the user can redeem their points for various rewards, as well as redeem a daily login reward to incentivize user engagement.
- Here we'll use some of our points to apply a discount to our cart
- We can see the total is recalculated, and now we can proceed with checkout.

# Checkout

- The billing details are prefilled using the user details set on their profile page.
- The totals are on the right side here with the credit card payment form, which gives feedback in real time.
- We can test a failed payment using this card number `4000000000000002`
- The user is given an error message that the card was declined, and now we can test a valid transaction using the credit card number `4242424242424242`

# Order Recieved

- The customer is then redirected to the confirmation page which gives them their order id, this is also made available in their order history.
- This ID can be used to track the delivery of their order now.

# Track Order

- Enter ID
- Update Status on CRM
- Resubmit ID

**Discuss Future Work**

Assign a time duration to each product, so that an estimate time can be generated using the order's line items. This will be displayed to the customer at phase 2.

Additionally, the implementation of geolocation would allow the use of the Google Maps Direction API to estimate the delivery time between the store location and the customer location, this would be displayed here at phase 3.

# CRM

- I'd like to take a final look at our backend employee portal.
- Along with the orders in progress here, we can view, edit and delete `CATEGORIES` and `PRODUCTS`
- For example if we were to change the price of the `USE SEARCH BAR` Chicken Burger from $15 to $16, it will be represented on the customer-facing menu.

**Closing**

With that I'd like to thank you for your time and I will bring this demonstration portion to a close.
