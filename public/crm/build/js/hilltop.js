$(document).ready(() => {
  $('#datatable-categories').DataTable({
    pageLength: 25,
    lengthMenu: [[25, 50, 100, 250, -1], ['25 Rows', '50 Rows', '100 Rows', '250 Rows', 'All Rows']],
    ajax: {
      url: '/api/categories',
      type: 'GET',
      dataSrc: '',
    },
    serverSide: false,
    processing: true,
    language: {
      processing: '<i class="fa fa-spinner fa-spin fa-3x fa-fw"></i><span class="sr-only"></span> ',
    },
    columns: [
      { data: 'name' },
      { data: 'slug' },
      {
        data: '_id',
        className: 'text-center',
        render(data, type, row, meta) {
          return `
          <a onclick="categoryEdit('${data}', '${row.name}')"><button class="btn btn-xs btn-success"><i class="fa fa-edit"></i></button></a>
          <a onclick="categoryDelete('${data}')"><button class="btn btn-xs btn-danger"><i class="fa fa-close"></i></button></a>
          `;
        },
      },
    ],
  });

  $('#datatable-users').DataTable({
    pageLength: 25,
    lengthMenu: [[25, 50, 100, 250, -1], ['25 Rows', '50 Rows', '100 Rows', '250 Rows', 'All Rows']],
    ajax: {
      url: '/api/users',
      type: 'GET',
      dataSrc: '',
    },
    serverSide: false,
    processing: true,
    language: {
      processing: '<i class="fa fa-spinner fa-spin fa-3x fa-fw"></i><span class="sr-only"></span> ',
    },
    columns: [
      { data: 'id' },
      { data: 'name' },
      { data: 'email' },
      { data: 'phone' },
      { data: 'points' },
      {
        data: 'role',
        className: 'text-center',
        render(data, type, row, meta) {
          switch (data) {
            case 4:
              return 'Administrator';
            case 3:
              return 'Manager';
            case 2:
              return 'Employee';
            case 1:
              return 'Customer';

            default:
              return 'NULL';
          }
        },
      },
    ],
  });

  $('#datatable-products').DataTable({
    pageLength: 25,
    lengthMenu: [[25, 50, 100, 250, -1], ['25 Rows', '50 Rows', '100 Rows', '250 Rows', 'All Rows']],
    ajax: {
      url: '/api/products',
      type: 'GET',
      dataSrc: '',
    },
    serverSide: false,
    processing: true,
    language: {
      processing: '<i class="fa fa-spinner fa-spin fa-3x fa-fw"></i><span class="sr-only"></span> ',
    },
    columns: [
      { data: 'name' },
      {
        data: 'price',
        className: 'text-center',
        render(data, type, row, meta) {
          return (data).toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
          });
        },
      },
      { data: 'categoryId' },
      { data: 'category' },
      { data: 'description' },
      { data: 'image' },
      {
        data: '_id',
        className: 'text-center',
        render(data, type, row, meta) {
          return `<a href="/crm/products/${data}"><button class="btn btn-xs btn-success"><i class="fa fa-edit"></i></button></a>`;
        },
      },
    ],
  });
});
