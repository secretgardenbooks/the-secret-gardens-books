// Configuración global y almacenamiento de estado
var URL_CSV = "https://docs.google.com/spreadsheets/d/1LyKI6OiOagXXQDel0a5NKojaggCccEEMQF43L2fgTuw/export?format=csv&gid=0";
var WHATSAPP = "584125713381";
var CART_GOAL = 5;
var products = [];

// Recuperar datos locales de sesión en el navegador si existen
var cart = (function() {
  try { return JSON.parse(localStorage.getItem('sgb_cart')) || []; }
  catch(e) { return []; }
})();
var favs = (function() {
  try { return JSON.parse(localStorage.getItem('sgb_favs')) || []; }
  catch(e) { return []; }
})();
var currentModalId = null;

/* ── Estrellas ── */
function createStars() {
  var container = document.getElementById('stars');
  if(!container) return;
  for (var i = 0; i < 85; i++) {
    var star = document.createElement('div');
    star.className = 'star';
    star.style.left = (Math.random() * 100) + '%';
    star.style.top = (Math.random() * 100) + '%';
    var size = Math.random() * 2.2 + 0.8;
    star.style.width = size + 'px'; star.style.height = size + 'px';
    star.style.setProperty('--duration', (Math.random() * 3 + 1.5) + 's');
    container.appendChild(star);
  }
}

/* ── Skeleton loader ── */
function showSkeleton() {
  var grid = document.getElementById('skeletonGrid');
  if(!grid) return;
  var html = '';
  for (var i = 0; i < 6; i++) {
    html += '<div class="skeleton-card">' +
      '<div class="skeleton-img"></div>' +
      '<div class="skeleton-body">' +
        '<div class="skeleton-line"></div>' +
        '<div class="skeleton-line short"></div>' +
        '<div class="skeleton-line price"></div>' +
      '</div>' +
    '</div>';
  }
  grid.innerHTML = html;
}

/* ── URL estable Google Drive ── */
function getStableImageUrl(rawImg) {
  if (!rawImg) return '';
  if (rawImg.indexOf('drive.google.com') !== -1) {
    var matchD = rawImg.match(/\/d\/([a-zA-Z0-9_-]+)/);
    var matchId = rawImg.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    var driveId = (matchD && matchD[1]) || (matchId && matchId[1]);
    if (driveId) return 'https://drive.google.com/thumbnail?id=' + driveId + '&sz=w400';
  }
  return rawImg;
}

/* ── Carga de datos optimizada en tiempo real (Sin caché local) ── */
async function loadData() {
  try {
    var tstamp = new Date().getTime();
    var urlConAntiCache = URL_CSV + "&t=" + tstamp;

    var response = await fetch(urlConAntiCache);
    var rawData = await response.text();

    Papa.parse(rawData, {
      header: false,
      skipEmptyLines: true,
      complete: function(results) {
        var rows = results.data.slice(1);
        products = rows.map(function(cols, index) {
          var rawPrice = cols[4] ? String(cols[4]).replace(/[^0-9.-]+/g, '') : '0';
          var parsedPrice = parseFloat(rawPrice) || 0;
          var rawImg = cols[6] ? cols[6].trim() : '';
          var STOP = ['de','del','la','el','los','las','y','e','a','en','con','por','para','un','una','o','u','al'];
          var genres = (function() {
            if (!cols[3]) return ['General'];
            var seen = {};
            var tags = [];
            cols[3].split(',').forEach(function(phrase) {
              phrase.trim().split(/\s+/).forEach(function(word) {
                var w = word.trim().replace(/[^a-zA-ZáéíóúÁÉÍÓÚüÜñÑ]/g, '');
                if (!w || w.length < 3) return;
                var wl = w.toLowerCase();
                if (STOP.indexOf(wl) !== -1) return;
                var tag = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
                if (!seen[tag]) { seen[tag] = true; tags.push(tag); }
              });
            });
            return tags.length ? tags : ['General'];
          })();
          var rawStock = cols[7] ? cols[7].trim().toLowerCase() : '';
          var inStock = rawStock !== 'agotado' && rawStock !== 'no' && rawStock !== '0';
          
          // Lógica para la columna K (Top Carrusel)
          var rawCarousel = cols[10] ? cols[10].trim() : '';
          var carouselMatch = rawCarousel.match(/\d+/);
          var carouselRank = carouselMatch ? parseInt(carouselMatch[0], 10) : null;

          // NUEVO: Lógica Matemática para Columna L (Descuento - Precio Inflado)
          var rawDiscount = cols[11] ? cols[11].trim() : '';
          var discountMatch = rawDiscount.match(/\d+/);
          var discountPercent = discountMatch ? parseInt(discountMatch[0], 10) : 0;
          var originalPrice = null;
          
          // Si escribes un número del 1 al 99 en la columna L, calculará el precio inflado
          if (discountPercent > 0 && discountPercent < 100 && parsedPrice > 0) {
            originalPrice = parsedPrice / (1 - (discountPercent / 100));
          }

          return {
            id: index,
            title: cols[1] || 'Sin título',
            author: cols[2] || 'Anónimo',
            genres: genres,
            price: parsedPrice,
            desc: cols[5] || 'Este libro guarda secretos que solo descubrirás al leerlo...',
            img: getStableImageUrl(rawImg),
            inStock: inStock,
            cover: cols[8] ? cols[8].trim().replace(/\n/g,'').replace(/\r/g,'') : '',
            badge: cols[9] ? cols[9].trim() : '',
            carouselRank: carouselRank,
            discountPercent: discountPercent,
            originalPrice: originalPrice
          };
        }).filter(function(p) { return p.title !== 'Sin título'; });

        populateGenres();
        
        var skel = document.getElementById('skeletonGrid');
        var prodGrid = document.getElementById('productGrid');
        if(skel) skel.style.display = 'none';
        if(prodGrid) prodGrid.style.display = 'grid';
        
        renderCarousel();
        renderGrid(products);
        checkUrlParam();
      }
    });
  } catch(e) {
    var skel = document.getElementById('skeletonGrid');
    if(skel) skel.innerHTML = '<p style="grid-column:span 2; text-align:center; color:var(--muted); padding:40px;">Hubo un error al cargar el jardín.</p>';
    console.error(e);
  }
}

function populateGenres() {
  var seen = {};
  var unique = [];
  products.forEach(function(p) {
    p.genres.forEach(function(g) {
      if (!seen[g]) { seen[g] = true; unique.push(g); }
    });
  });
  unique.sort();
  var select = document.getElementById('genreFilter');
  if(!select) return;
  unique.forEach(function(g) {
    var opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    select.appendChild(opt);
  });
}

/* ── Función para dibujar el Carrusel Netflix ── */
function renderCarousel() {
  var sec = document.getElementById('topCarouselSection');
  var track = document.getElementById('carouselTrack');
  if (!sec || !track) return;

  var topBooks = products.filter(function(p) { return p.carouselRank !== null; });
  topBooks.sort(function(a, b) { return a.carouselRank - b.carouselRank; });

  if (topBooks.length === 0) {
    sec.style.display = 'none';
    return;
  }

  sec.style.display = 'block';
  track.innerHTML = topBooks.map(function(p) {
    return `
      <div class="carousel-item" onclick="openModal(${p.id})">
        <div class="carousel-number">${p.carouselRank}</div>
        <img class="carousel-img" src="${p.img}" onerror="this.src='https://placehold.co/100x150/111c3a/a98fd0?text=SGB'">
      </div>
    `;
  }).join('');
}

/* ── Filtros + orden + contador ── */
function applyFilters() {
  var searchInput = document.getElementById('searchInput');
  var genreFilter = document.getElementById('genreFilter');
  var sortSelect = document.getElementById('sortSelect');
  
  var term = searchInput ? searchInput.value.toLowerCase() : '';
  var genre = genreFilter ? genreFilter.value : '';
  var sort = sortSelect ? sortSelect.value : '';

  var filtered = products.filter(function(p) {
    var matchText = !term || p.title.toLowerCase().indexOf(term) !== -1 || p.author.toLowerCase().indexOf(term) !== -1;
    var matchGenre = !genre || p.genres.indexOf(genre) !== -1;
    return matchText && matchGenre;
  });

  if (sort === 'price-asc')  filtered.sort(function(a,b){ return a.price - b.price; });
  if (sort === 'price-desc') filtered.sort(function(a,b){ return b.price - a.price; });
  if (sort === 'title-asc')  filtered.sort(function(a,b){ return a.title.localeCompare(b.title); });
  if (sort === 'title-desc') filtered.sort(function(a,b){ return b.title.localeCompare(a.title); });

  var count = document.getElementById('resultsCount');
  if (count) {
    if (term || genre || sort) {
      count.innerText = filtered.length + ' de ' + products.length + ' libros';
    } else {
      count.innerText = products.length + ' libros en el catálogo';
    }
  }

  renderGrid(filtered);
}

/* ── Render con lazy loading y Badges Personalizados ── */
function renderGrid(lista) {
  var grid = document.getElementById('productGrid');
  if (!grid) return;
  if (lista.length === 0) {
    grid.innerHTML = '<div class="no-results">✨ No se encontraron libros con ese criterio.</div>';
    return;
  }
  grid.innerHTML = lista.map(function(p) {
    var badgeHtml = p.inStock ? '' : '<span class="badge-agotado">Agotado</span>';
    var outClass = p.inStock ? '' : ' out-of-stock';
    
    var customBadgeHtml = '';
    var badgeClass = '';
    
    if (p.inStock && p.badge) {
      var bTxt = p.badge.toLowerCase();
      if (bTxt.indexOf('vendido') !== -1 || bTxt.indexOf('oro') !== -1) {
        badgeClass = 'badge-mas-vendido';
      } else if (bTxt.indexOf('nuevo') !== -1 || bTxt.indexOf('verde') !== -1) {
        badgeClass = 'badge-nuevo';
      } else {
        badgeClass = 'badge-destacado';
      }
      customBadgeHtml = `<span class="special-badge ${badgeClass}">${p.badge}</span>`;
    }
    
    // Inyectar bloque del precio (con o sin descuento matemático)
    var priceHtml = '';
    if (p.price) {
      if (p.originalPrice) {
        priceHtml = `
          <div class="price-wrap">
            <span class="price-original">$${p.originalPrice.toFixed(2)}</span>
            <span class="card-price">$${p.price.toFixed(2)}</span>
            <span class="discount-tag">-${p.discountPercent}%</span>
          </div>`;
      } else {
        priceHtml = `<div class="card-price">$${p.price.toFixed(2)}</div>`;
      }
    } else {
      priceHtml = `<div class="card-price" style="font-size:0.72rem;color:var(--muted);font-weight:400;">Consultar precio</div>`;
    }
    
    var MAX_VISIBLE = 3;
    var visibleTags = p.genres.slice(0, MAX_VISIBLE).map(function(g) {
      return '<span class="genre-tag">' + g + '</span>';
    }).join('');
    var hiddenTags = p.genres.slice(MAX_VISIBLE);
    var hiddenHtml = hiddenTags.length
      ? '<span class="tags-overflow" id="extra-' + p.id + '" style="display:none; flex-wrap:wrap; gap:2px;">'  +
        hiddenTags.map(function(g){ return '<span class="genre-tag" style="margin-right:2px;">' + g + '</span>'; }).join('') +
        '</span>' +
        '<button class="tags-more-btn" onclick="event.stopPropagation();toggleTags(' + p.id + ',this)">+' + hiddenTags.length + ' más</button>'
      : '';

    return `
      <div class="card${outClass}" onclick="openModal(${p.id})">
        <div class="card-wrap">
          ${badgeHtml}
          ${customBadgeHtml}
          <img data-src="${p.img}" class="card-img" onerror="this.src='https://placehold.co/300x400/111c3a/a98fd0?text=The+Secret+Gardens'; this.classList.add('loaded')">
        </div>
        <div class="card-body">
          <div class="card-title">${p.title}</div>
          ${p.cover ? `<span class="cover-badge ${p.cover.toLowerCase().indexOf('dura') !== -1 ? 'cover-dura' : 'cover-blanda'}">${p.cover.toLowerCase().indexOf('dura') !== -1 ? '📗' : '📄'} ${p.cover}</span>` : ''}
          <div class="card-genres">${visibleTags}${hiddenHtml}</div>
          ${priceHtml}
          <div class="btn-group">
            <button class="btn btn-buy" onclick="event.stopPropagation();buyNow(${p.id})">Comprar</button>
            <button class="btn btn-cart" onclick="event.stopPropagation();addToCart(${p.id})">+ Añadir</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lazyLoadImages();

  var countBox = document.getElementById('resultsCount');
  if (countBox && !countBox.innerText) {
    countBox.innerText = products.length + ' libros en el catálogo';
  }
}

function lazyLoadImages() {
  var imgs = document.querySelectorAll('.card-img[data-src]');
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          img.src = img.dataset.src;
          img.onload = function() { img.classList.add('loaded'); };
          obs.unobserve(img);
        }
      });
    }, { rootMargin: '100px' });
    imgs.forEach(function(img) { obs.observe(img); });
  } else {
    imgs.forEach(function(img) {
      img.src = img.dataset.src;
      img.onload = function() { img.classList.add('loaded'); };
    });
  }
}

/* ── Modal ── */
function openModal(id) {
  var p = products.find(function(x) { return x.id === id; });
  if(!p) return;
  currentModalId = id;
  
  document.getElementById('modalImg').src = p.img;
  document.getElementById('modalTitle').innerText = p.title;
  document.getElementById('modalAuthor').innerText = p.author;
  
  var coverEl = document.getElementById('modalCover');
  if (p.cover) {
    var isDura = p.cover.toLowerCase().indexOf('dura') !== -1;
    coverEl.className = 'cover-badge ' + (isDura ? 'cover-dura' : 'cover-blanda');
    coverEl.innerHTML = (isDura ? '📗' : '📄') + ' ' + p.cover;
    coverEl.style.display = 'inline-flex';
  } else {
    coverEl.style.display = 'none';
  }
  
  document.getElementById('modalGenres').innerHTML = p.genres.map(function(g) {
    return '<span class="modal-genre-tag">' + g + '</span>';
  }).join('');
  document.getElementById('modalDesc').innerText = p.desc;
  
  var mpEl = document.getElementById('modalPrice');
  if (p.price) {
    if (p.originalPrice) {
      // Mostrar precio falso tachado junto al precio real y la etiqueta en el modal
      mpEl.innerHTML = `<span class="price-original" style="font-size:0.9rem;">$${p.originalPrice.toFixed(2)}</span>$${p.price.toFixed(2)} <span class="discount-tag" style="font-size:0.75rem;">-${p.discountPercent}%</span>`;
    } else {
      mpEl.innerText = '$' + p.price.toFixed(2);
    }
    mpEl.style.color = 'var(--gold)';
  } else {
    mpEl.innerText = 'Consultar precio';
    mpEl.style.color = 'var(--muted)';
    mpEl.style.fontSize = '0.85rem';
    mpEl.style.fontWeight = '400';
  }
  
  var summ = products.filter(function(x) {
    if (x.id === p.id) return false;
    return x.genres.some(function(g) { return p.genres.indexOf(g) !== -1; });
  }).slice(0, 5);
  
  var suggRow = document.getElementById('suggestionsRow');
  var suggSec = document.getElementById('modalSuggestions');
  if (summ.length && suggRow && suggSec) {
    suggRow.innerHTML = summ.map(function(s) {
      return `
        <div class="suggestion-card" onclick="openModal(${s.id})">
          <img src="${s.img}" onerror="this.src='https://placehold.co/62x82/111c3a/a98fd0?text=SGB'">
          <div class="suggestion-card-title">${s.title}</div>
        </div>
      `;
    }).join('');
    suggSec.style.display = 'block';
  } else if(suggSec) {
    suggSec.style.display = 'none';
  }

  document.getElementById('modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  var fab = document.querySelector('.cart-fab');
  if(fab) { fab.style.opacity = '0'; fab.style.pointerEvents = 'none'; }
}

function closeModal() {
  var modalEl = document.getElementById('modal');
  if(modalEl) modalEl.style.display = 'none';
  document.body.style.overflow = 'auto';
  currentModalId = null;
  var fab = document.querySelector('.cart-fab');
  if(fab) { fab.style.opacity = '1'; fab.style.pointerEvents = 'auto'; }
}

function buyNowModal() {
  if (currentModalId !== null) {
    var id = currentModalId;
    closeModal();
    buyNow(id);
  }
}
function addToCartModal() {
  if (currentModalId !== null) {
    var id = currentModalId;
    addToCart(id);
    closeModal();
  }
}

/* ── Compartir libro ── */
function shareBook() {
  if (currentModalId === null) return;
  var p = products.find(function(x) { return x.id === currentModalId; });
  var url = 'https://secretgardenbooks.github.io/the-secret-gardens-books/?libro=' + p.id;
  var text = '📚 *' + p.title + '* — ' + p.author + '\n💰 $' + p.price.toFixed(2) + '\n\n🌙 The Secret Gardens Books\n👉 ' + url;
  if (navigator.share) {
    navigator.share({ title: p.title, text: text, url: url }).catch(function(){});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function() { showToast('✅ Link copiado al portapapeles'); });
  } else {
    showToast('📋 ' + url);
  }
}

/* ── Carrito ── */
function addToCart(id) {
  var p = products.find(function(x) { return x.id === id; });
  if (!p || !p.inStock) return;
  var exists = cart.find(function(x) { return x.id === id; });
  if (exists) { exists.qty++; } else { cart.push(Object.assign({}, p, { qty: 1 })); }
  updateUI();
  showToast('📚 "' + p.title + '" añadido al carrito');
}

function changeQty(index, delta) {
  cart[index].qty += delta;
  if (cart[index].qty <= 0) cart.splice(index, 1);
  updateUI();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateUI();
}

function showToast(msg) {
  var toast = document.getElementById('toast');
  if(!toast) return;
  toast.innerText = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2500);
}

// Guardar en el almacenamiento persistente local
function saveCart() {
  try { localStorage.setItem('sgb_cart', JSON.stringify(cart)); }
  catch(e) {}
}

function updateUI() {
  saveCart();
  var totalItems = cart.reduce(function(acc, item) { return acc + item.qty; }, 0);
  var badge = document.getElementById('cartBadge');
  if(badge) {
    badge.innerText = totalItems;
    badge.classList.remove('bump');
    void badge.offsetWidth;
    badge.classList.add('bump');
    setTimeout(function() { badge.classList.remove('bump'); }, 200);
  }

  var cartList = document.getElementById('cartList');
  var progressEl = document.getElementById('cartProgress');
  var totalRowEl = document.getElementById('cartTotalRow');
  var notesWrap = document.getElementById('cartNotesWrap');
  
  if (!cartList) return;

  if (cart.length === 0) {
    cartList.innerHTML = '<div class="cart-empty">🌙 Tu carrito está vacío</div>';
    var totalBox = document.getElementById('cartTotal');
    if(totalBox) totalBox.innerText = '';
    if(progressEl) progressEl.style.display = 'none';
    if(totalRowEl) totalRowEl.style.display = 'none';
    if (notesWrap) notesWrap.style.display = 'none';
    return;
  }
  if (notesWrap) notesWrap.style.display = 'block';
  if (progressEl) progressEl.style.display = 'block';
  if (totalRowEl) totalRowEl.style.display = 'flex';
  
  var pct = Math.min(100, Math.round((totalItems / CART_GOAL) * 100));
  var fill = document.getElementById('progressFill');
  var progTxt = document.getElementById('progressText');
  var progItems = document.getElementById('progressItems');
  
  if(fill) fill.style.width = pct + '%';
  if(progTxt) progTxt.innerText = totalItems >= CART_GOAL ? '¡Pedido completo! 🎉' : 'Progreso del pedido';
  if(progItems) progItems.innerText = totalItems + ' / ' + CART_GOAL + ' libros';

  var totalMoney = 0;
  cartList.innerHTML = cart.map(function(item, i) {
    totalMoney += item.price * item.qty;
    return '<div class="cart-item">' +
      '<div class="cart-item-info">' +
        '<div class="cart-item-title">' + item.title + '</div>' +
        '<div class="cart-item-sub">' + item.author + '</div>' +
      '</div>' +
      '<div class="qty-controls">' +
        '<button class="qty-btn" onclick="changeQty(' + i + ', -1)">−</button>' +
        '<span class="qty-num">' + item.qty + '</span>' +
        '<button class="qty-btn" onclick="changeQty(' + i + ', 1)">+</button>' +
      '</div>' +
      '<span class="cart-item-price">$' + (item.price * item.qty).toFixed(2) + '</span>' +
      '<button class="cart-item-remove" onclick="removeFromCart(' + i + ')" title="Eliminar">✕</button>' +
    '</div>';
  }).join('');

  var finalTotal = document.getElementById('cartTotal');
  if(finalTotal) finalTotal.innerText = '$' + totalMoney.toFixed(2);
}

function toggleCart() { 
  var sidebar = document.getElementById('sidebar');
  if(sidebar) sidebar.classList.toggle('open'); 
}

function buyNow(id) {
  var p = products.find(function(x) { return x.id === id; });
  if(!p) return;
  var priceStr = p.price ? '$' + p.price.toFixed(2) : 'Consultar precio';
  var msg = encodeURIComponent('🌙 *The Secret Gardens Books*\n\n*Pedido:*\n• ' + p.title + ' — ' + p.author + ' (x1) — ' + priceStr + '\n\n*Total: ' + priceStr + '*\n\n_(Enviado desde el catálogo)_');
  window.open('https://wa.me/' + WHATSAPP + '?text=' + msg);
}

function sendOrder() {
  if (cart.length === 0) {
    var emptyModal = document.getElementById('emptyCartModal');
    if(emptyModal) emptyModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    return;
  }
  var total = cart.reduce(function(acc, p) { return acc + ((p.price||0) * p.qty); }, 0);
  var confirmTotal = document.getElementById('confirmTotal');
  if(confirmTotal) confirmTotal.innerText = total > 0 ? '$' + total.toFixed(2) : 'A consultar';
  
  var confirmItems = document.getElementById('confirmItems');
  if(confirmItems) {
    confirmItems.innerHTML = cart.map(function(p) {
      var priceStr = p.price ? '$' + (p.price * p.qty).toFixed(2) : 'Consultar';
      return `
        <div class="confirm-item">
          <img class="confirm-item-img" src="${p.img}" onerror="this.src='https://placehold.co/44x58/111c3a/a98fd0?text=SGB'">
          <div class="confirm-item-info">
            <div class="confirm-item-title">${p.title}</div>
            <div class="confirm-item-meta">${p.author} · x${p.qty}</div>
          </div>
          <div class="confirm-item-price">${priceStr}</div>
        </div>
      `;
    }).join('');
  }
  
  var notesInput = document.getElementById('cartNotes');
  var notes = notesInput ? notesInput.value.trim() : '';
  var notesBox = document.getElementById('confirmNotesBox');
  if (notes && notesBox) {
    notesBox.innerText = '📝 ' + notes;
    notesBox.style.display = 'block';
  } else if (notesBox) {
    notesBox.style.display = 'none';
  }
  
  var confModal = document.getElementById('confirmModal');
  if(confModal) confModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeConfirm() {
  var confModal = document.getElementById('confirmModal');
  if(confModal) confModal.classList.remove('open');
  document.body.style.overflow = 'auto';
}

function doSendOrder() {
  var notesInput = document.getElementById('cartNotes');
  var notes = notesInput ? notesInput.value.trim() : '';
  var itemsStr = cart.map(function(p) {
    var pr = p.price ? '$' + (p.price * p.qty).toFixed(2) : 'Consultar precio';
    return '• ' + p.title + ' — ' + p.author + ' (x' + p.qty + ') — ' + pr;
  }).join('\n');
  var total = cart.reduce(function(acc, p) { return acc + ((p.price||0) * p.qty); }, 0);
  var totalStr = total > 0 ? '$' + total.toFixed(2) : 'A consultar';
  var notesLine = notes ? '\n\n📝 *Nota:* ' + notes : '';
  var msg = encodeURIComponent('🌙 *The Secret Gardens Books*\n\n*Pedido:*\n' + itemsStr + '\n\n*Total: ' + totalStr + '*' + notesLine + '\n\n_(Enviado desde el catálogo)_');
  window.open('https://wa.me/' + WHATSAPP + '?text=' + msg);
  closeConfirm();
}

function closeEmptyCart() {
  var emptyModal = document.getElementById('emptyCartModal');
  if(emptyModal) emptyModal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

function toggleFav(id, btn) {
  var idx = favs.indexOf(id);
  if (idx === -1) {
    favs.push(id);
    btn.innerHTML = '❤️';
    btn.classList.add('active');
    showToast('❤️ Añadido a favoritos');
  } else {
    favs.splice(idx, 1);
    btn.innerHTML = '🤍';
    btn.classList.remove('active');
  }
  try { localStorage.setItem('sgb_favs', JSON.stringify(favs)); } catch(e) {}
  renderFavs();
}

function renderFavs() {
  var sec = document.getElementById('favsSection');
  var grid = document.getElementById('favsGrid');
  if(!sec || !grid) return;
  if (!favs.length || !products.length) { sec.classList.remove('visible'); return; }
  sec.classList.add('visible');
  grid.innerHTML = favs.map(function(id) {
    var p = products.find(function(x){ return x.id === id; });
    if (!p) return '';
    return `
      <div class="fav-card" onclick="openModal(${p.id})" title="${p.title}">
        <img src="${p.img}" onerror="this.src='https://placehold.co/68x90/111c3a/a98fd0?text=SGB'">
        <div class="fav-card-title">${p.title}</div>
      </div>
    `;
  }).join('');
}

function clearFavs() {
  favs = [];
  try { localStorage.removeItem('sgb_favs'); } catch(e) {}
  renderFavs();
  renderGrid(products);
}

function toggleTags(id, btn) {
  var extra = document.getElementById('extra-' + id);
  if (!extra) return;
  if (extra.style.display === 'none') {
    extra.style.display = 'inline-flex';
    btn.innerText = 'Ver menos';
  } else {
    extra.style.display = 'none';
    btn.innerText = '+' + extra.querySelectorAll('.genre-tag').length + ' más';
  }
}

// Inicialización de escuchadores de eventos al cargar
var sInput = document.getElementById('searchInput');
if(sInput) {
  sInput.addEventListener('input', applyFilters);
}

function checkUrlParam() {
  var params = new URLSearchParams(window.location.search);
  var libroId = params.get('libro');
  if (libroId !== null) {
    var id = parseInt(libroId, 10);
    var p = products.find(function(x) { return x.id === id; });
    if (p) {
      setTimeout(function() { openModal(id); }, 300);
    }
  }
}

// Lanzamiento inicial de procesos
createStars();
showSkeleton();
loadData();
updateUI();
