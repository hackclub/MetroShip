// ── Cart state ────────────────────────────────────────────────────────────────

let cart = [];

function cartTotal() {
    return cart.reduce((sum, item) => sum + item.ticketCost, 0);
}

function updateCartBadge() {
    const badge = document.getElementById('cart-count');
    if (badge) badge.textContent = cart.length;
}

function getCurrentTokens() {
    const el = document.getElementById('token-display');
    if (!el) return 0;
    const match = el.textContent.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
}

function renderCartPanel() {
    const list = document.getElementById('cart-items-list');
    const totalEl = document.getElementById('cart-total-display');
    const checkoutBtn = document.getElementById('checkout-btn');
    if (!list) return;

    if (cart.length === 0) {
        list.innerHTML = '<p style="color:#555;font-size:0.9vw;text-align:center;padding:24px 0;">Your cart is empty</p>';
    } else {
        list.innerHTML = cart.map((item, i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #1a1a1a;">
                <img src="${item.itemImg || ''}" style="width:44px;height:44px;object-fit:contain;border-radius:6px;background:#111;flex-shrink:0;" onerror="this.style.display='none'">
                <div style="flex:1;min-width:0;">
                    <div style="color:aqua;font-size:0.9vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.itemName}</div>
                    <div style="color:#555;font-size:0.75vw;">${item.prizeName} &middot; ${item.ticketCost} ticket${item.ticketCost !== 1 ? 's' : ''}</div>
                </div>
                <button class="remove-cart-item" data-index="${i}" title="Remove" style="background:none;border:none;color:#555;cursor:pointer;font-size:1vw;padding:4px 6px;flex-shrink:0;">&times;</button>
            </div>
        `).join('');
    }

    const total = cartTotal();
    const tokens = getCurrentTokens();
    const enough = tokens >= total;
    if (totalEl) {
        totalEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="color:#888;font-size:0.9vw;">Total:</span>
                <span style="color:limegreen;font-weight:bold;font-size:0.9vw;">${total} ticket${total !== 1 ? 's' : ''}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#888;font-size:0.85vw;">You have:</span>
                <span style="color:${enough || cart.length === 0 ? '#888' : 'red'};font-size:0.85vw;">${tokens} ticket${tokens !== 1 ? 's' : ''}${!enough && cart.length > 0 ? ' &mdash; not enough' : ''}</span>
            </div>
        `;
    }
    if (checkoutBtn) {
        const canCheckout = cart.length > 0 && enough;
        checkoutBtn.disabled = !canCheckout;
        checkoutBtn.style.opacity = canCheckout ? '1' : '0.35';
        checkoutBtn.style.cursor = canCheckout ? 'pointer' : 'not-allowed';
    }
}

function openCart() {
    const panel = document.getElementById('cart-panel');
    if (panel) {
        panel.style.display = 'flex';
        renderCartPanel();
    }
}

function closeCart() {
    const panel = document.getElementById('cart-panel');
    if (panel) panel.style.display = 'none';
}

async function handleCheckout() {
    const email = localStorage.getItem('email');
    if (!email) { alert('Please log in first.'); return; }

    const total = cartTotal();
    const tokens = getCurrentTokens();
    if (tokens < total) {
        alert(`Not enough tickets. You have ${tokens} but your cart costs ${total}.`);
        return;
    }

    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Processing…';
    }

    try {
        const res = await fetch('/api/submit-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                items: cart.map(item => ({
                    name: item.itemName,
                    prize: item.prizeName,
                    tickets: item.ticketCost,
                    img: item.itemImg
                })),
                totalTickets: total
            })
        });
        const rawText = await res.text();
        let data;
        try { data = JSON.parse(rawText); } catch {
            console.error('submit-order non-JSON response:', rawText);
            alert('Checkout failed — server returned an unexpected response (see console).');
            if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.textContent = 'Checkout'; }
            return;
        }
        if (data.success) {
            cart = [];
            updateCartBadge();
            closeCart();
            const tokenEl = document.getElementById('token-display');
            if (tokenEl) tokenEl.textContent = `Tickets: ${data.remainingTickets}`;
            window.open('https://airtable.com/app9IYnpxO1DtNd97/pagnQ8SUfeAkkOtAw/form', '_blank');
            alert(`Order placed! You have ${data.remainingTickets} ticket${data.remainingTickets !== 1 ? 's' : ''} remaining.\n\nA shipping address form has opened in a new tab — please fill it out so we can send your prizes.`);
        } else {
            alert('Error: ' + (data.error || 'Failed to place order'));
            if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.textContent = 'Checkout'; }
        }
    } catch (err) {
        console.error('Checkout error:', err);
        alert('Checkout failed: ' + err.message);
        if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.textContent = 'Checkout'; }
    }
}

// ── Event delegation ──────────────────────────────────────────────────────────

document.addEventListener('click', async (e) => {
    const overlay = document.getElementById('overlay');

    // Cart toggle
    if (e.target.closest('#cart-toggle')) {
        openCart();
        return;
    }

    // Close cart
    if (e.target.closest('#close-cart')) {
        closeCart();
        return;
    }

    // Remove item from cart
    const removeBtn = e.target.closest('.remove-cart-item');
    if (removeBtn) {
        const index = parseInt(removeBtn.dataset.index);
        if (!isNaN(index)) {
            cart.splice(index, 1);
            updateCartBadge();
            renderCartPanel();
        }
        return;
    }

    // Checkout
    const checkoutBtn = e.target.closest('#checkout-btn');
    if (checkoutBtn && !checkoutBtn.disabled) {
        handleCheckout();
        return;
    }

    // Add to cart (must check before prize-card so stopPropagation works)
    const orderBtn = e.target.closest('.order-btn');
    if (orderBtn) {
        e.stopPropagation();
        cart.push({
            prizeName: orderBtn.dataset.prize || '',
            ticketCost: parseInt(orderBtn.dataset.tickets) || 0,
            itemName: orderBtn.dataset.item || '',
            itemImg: orderBtn.dataset.img || ''
        });
        updateCartBadge();
        const panel = document.getElementById('cart-panel');
        if (panel && panel.style.display !== 'none') renderCartPanel();
        const orig = orderBtn.textContent;
        orderBtn.textContent = '✓ Added';
        orderBtn.style.background = 'limegreen';
        setTimeout(() => {
            orderBtn.textContent = orig;
            orderBtn.style.background = 'aqua';
        }, 1200);
        return;
    }

    // Prize card open
    const card = e.target.closest('.prize-card');
    if (card && overlay) {
        const name = card.dataset.name;
        const tickets = card.dataset.tickets;
        const description = card.dataset.description;
        const image = card.dataset.image;
        const ticketCost = parseInt(tickets) || 0;

        let itemsData = [];
        if (card.dataset.items) {
            try { itemsData = JSON.parse(card.dataset.items); } catch (err) {
                console.error('Error parsing items JSON:', err);
            }
        }

        try {
            const response = await fetch('prize-overlay-template.html');
            const template = await response.text();

            const imageHtml = image
                ? `<img src="${image}" style="width:15vw;min-width:150px;height:auto;border-radius:50%;border:4px solid aqua;box-shadow:0 0 30px aqua;">`
                : '';

            const itemsHtml = itemsData.map(item => `
                <div style="flex:0 1 calc(22%);background:rgba(255,255,255,0.05);border:1px solid aqua;padding:0.8vw;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;min-width:120px;">
                    <img src="${item.img || 'assets/placeholder.png'}" style="width:90%;height:auto;max-height:8vw;object-fit:contain;">
                    <h3 style="font-size:0.9vw;color:aqua;margin:0.5vw 0;font-family:'Nasalization';">${item.name}</h3>
                    <button class="order-btn"
                        data-prize="${(name || '').replace(/"/g, '&quot;')}"
                        data-tickets="${ticketCost}"
                        data-item="${item.name.replace(/"/g, '&quot;')}"
                        data-img="${(item.img || '').replace(/"/g, '&quot;')}"
                        style="background:aqua;color:black;border:none;padding:0.4vw 0.8vw;font-family:'Nasalization';font-size:0.7vw;cursor:pointer;border-radius:4px;font-weight:bold;">
                        Add to Cart
                    </button>
                </div>
            `).join('');

            const finalHtml = template
                .replace(/{{NAME}}/g, name || '')
                .replace(/{{TICKETS}}/g, tickets || '')
                .replace(/{{DESCRIPTION}}/g, description || '')
                .replace(/{{IMAGE_HTML}}/g, imageHtml)
                .replace(/{{ITEMS_HTML}}/g, itemsHtml);

            overlay.innerHTML = finalHtml;
            overlay.style.display = 'block';
        } catch (error) {
            console.error('Error loading prize template:', error);
        }
        return;
    }

    // Close overlay
    if (overlay && (e.target === overlay || e.target.classList.contains('close-btn'))) {
        overlay.style.display = 'none';
    }
});
