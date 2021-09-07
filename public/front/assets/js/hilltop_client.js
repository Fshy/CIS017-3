/* eslint-disable no-undef */
const stripe = Stripe('pk_test_9xvcruuzP3u6tx5jqlMHc0oN');

// Set up Stripe.js and Elements to use in checkout form
const elements = stripe.elements();
const style = {
  base: {
    color: '#32325d',
  },
};

const card = elements.create('card', { style });
card.mount('#card-element');

card.on('change', ({ error }) => {
  const displayError = document.getElementById('card-errors');
  if (error) {
    displayError.textContent = error.message;
  } else {
    displayError.textContent = '';
  }
});

const form = document.getElementById('payment-form');
console.log(form);

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  // If the client secret was rendered server-side as a data-secret attribute
  // on the <form> element, you can retrieve it here by calling `form.dataset.secret`
  stripe.confirmCardPayment(form.dataset.secret, {
    receipt_email: document.getElementById('billing_email').value,
    payment_method: {
      card,
      billing_details: {
        name: 'Jenny Rosen',
      },
    },
  }).then((result) => {
    if (result.error) {
      // Show error to your customer (e.g., insufficient funds)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: result.error.message,
      });
    } else if (result.paymentIntent.status === 'succeeded') {
      $.post('/api/orders/new', {
        firstName: $('#billing_first_name').val(),
        lastName: $('#billing_last_name').val(),
        email: $('#billing_email').val(),
        phone: $('#billing_phone').val(),
        address: {
          street1: $('#billing_address_1').val(),
          street2: $('#billing_address_2').val(),
          city: $('#billing_city').val(),
        },
        stripe: {
          id: result.paymentIntent.id,
          status: result.paymentIntent.status,
        },
        notes: $('#order_comments').val(),
        timestamp: Date.now(),
      })
        .done((resp) => {
          Swal.fire({
            icon: resp.status.icon,
            title: resp.status.title,
            text: resp.status.text,
          }).then(() => {
            window.location.href = `/order-complete/${resp.orderId}`;
          });
        }).fail((err) => {
          Swal.fire({
            icon: 'error',
            title: err.message,
          });
        });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Payment Failed',
        text: result.paymentIntent.status,
      });
    }
  });
});
