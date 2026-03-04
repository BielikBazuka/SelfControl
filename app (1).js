// ═══════════════════════════════════════════════════
// KALORIX — Calorie Tracker
// Two JSONBin bins: one for recipes/ingredients, one for log data
// ═══════════════════════════════════════════════════

const app = {

    // ── Config ─────────────────────────────────────
    REC_BIN:    'YOUR_RECIPES_BIN_ID',
    LOG_BIN:    'YOUR_LOG_BIN_ID',
    API_KEY:    'YOUR_API_KEY',

    get REC_URL() { return 'https://api.jsonbin.io/v3/b/' + this.REC_BIN; },
    get LOG_URL() { return 'https://api.jsonbin.io/v3/b/' + this.LOG_BIN; },

    // ── State ──────────────────────────────────────
    ingredients: {},
    recipes: [],
    log: {},
    goal: 0,
    currentDate: null,
    currentLogType: 'ingredient',
    currentRecipe: { name: '', ingredients: [], steps: [] },
    editingRecipeId: null,
    chart: null,
    currentTimeframe: 7,

    // ── Init ───────────────────────────────────────
    async init() {
        this.currentDate = this.today();
        this.ingredients = Object.assign({}, INGREDIENTS_DB);

        var d = new Date();
        document.getElementById('todayDate').textContent =
            d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        await this.loadRecipesBin();
        await this.loadLogBin();

        this.renderDashboard();
        this.renderRecipesPage();
        this.buildChart();

        var self = this;
        document.getElementById('dayNote').addEventListener('input', function() {
            if (!self.log[self.currentDate]) self.log[self.currentDate] = { meals: [], note: '' };
            self.log[self.currentDate].note = this.value;
            clearTimeout(self._noteTimer);
            self._noteTimer = setTimeout(function() { self.saveLogBin(); }, 1000);
        });

        document.querySelector('.goal-display').addEventListener('click', function() {
            app.openGoalModal();
        });
    },

    today() {
        var d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth()+1).padStart(2,'0') + '-' +
            String(d.getDate()).padStart(2,'0');
    },

    // ── JSONBin ────────────────────────────────────
    async loadRecipesBin() {
        try {
            var res = await fetch(this.REC_URL + '/latest');
            if (!res.ok) return;
            var data = await res.json();
            var record = data.record || data;
            if (record.recipes) this.recipes = record.recipes;
            if (record.ingredients) this.ingredients = Object.assign({}, this.ingredients, record.ingredients);
        } catch(e) { console.warn('Recipes bin load failed:', e); }
    },

    async saveRecipesBin() {
        var userIng = {};
        var keys = Object.keys(this.ingredients);
        for (var i = 0; i < keys.length; i++) {
            if (!INGREDIENTS_DB[keys[i]]) userIng[keys[i]] = this.ingredients[keys[i]];
        }
        try {
            var res = await fetch(this.REC_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': this.API_KEY },
                body: JSON.stringify({ recipes: this.recipes, ingredients: userIng })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
        } catch(e) { alert('Save error: ' + e.message); }
    },

    async loadLogBin() {
        try {
            var res = await fetch(this.LOG_URL + '/latest');
            if (!res.ok) return;
            var data = await res.json();
            var record = data.record || data;
            if (record.log) this.log = record.log;
            if (record.goal) this.goal = record.goal;
        } catch(e) { console.warn('Log bin load failed:', e); }
    },

    async saveLogBin() {
        try {
            var res = await fetch(this.LOG_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': this.API_KEY },
                body: JSON.stringify({ log: this.log, goal: this.goal })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
        } catch(e) { console.warn('Log bin save failed:', e); }
    },

    // ── Navigation ─────────────────────────────────
    switchPage(page) {
        document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
        document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
        document.getElementById('page-' + page).classList.add('active');
        document.querySelector('[data-page="' + page + '"]').classList.add('active');
    },

    // ── Dashboard ──────────────────────────────────
    renderDashboard() {
        var dayData = this.log[this.currentDate] || { meals: [], note: '' };
        var total = this.getDayKcal(this.currentDate);

        document.getElementById('todayKcal').textContent = Math.round(total);
        document.getElementById('mealCount').textContent = dayData.meals.length;

        if (this.goal > 0) {
            document.getElementById('goalKcal').textContent = this.goal;
            var remaining = this.goal - total;
            var remEl = document.getElementById('remainingKcal');
            remEl.textContent = Math.round(remaining);
            remEl.style.color = remaining < 0 ? 'var(--accent3)' : 'var(--accent2)';

            var pct = Math.min((total / this.goal) * 100, 100);
            document.getElementById('progressFill').style.width = pct + '%';
            document.getElementById('progressFill').classList.toggle('over', total > this.goal);
            document.getElementById('progressPct').textContent = Math.round((total / this.goal) * 100) + '%';
            document.getElementById('sidebarGoal').textContent = this.goal + ' kcal';
        } else {
            document.getElementById('goalKcal').textContent = '—';
            document.getElementById('remainingKcal').textContent = '—';
            document.getElementById('progressFill').style.width = '0%';
            document.getElementById('progressPct').textContent = '—';
        }

        var today = this.today();
        var label = this.currentDate === today ? 'Today' :
            new Date(this.currentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        document.getElementById('logDateLabel').textContent = label;

        document.getElementById('dayNote').value = dayData.note || '';

        var html = '';
        if (dayData.meals.length === 0) {
            html = '<div class="empty-meals">No meals logged. Click "Add meal" to get started.</div>';
        } else {
            for (var i = 0; i < dayData.meals.length; i++) {
                var m = dayData.meals[i];
                html += '<div class="meal-item">' +
                    '<div class="meal-left">' +
                    '<span class="meal-name">' + m.name + '</span>' +
                    '<span class="meal-meta">' + m.amount + (m.unit || 'g') + ' · ' + m.type + (m.time ? ' · ' + m.time : '') + '</span>' +
                    '</div>' +
                    '<div class="meal-right">' +
                    '<span class="meal-kcal">' + Math.round(m.kcal) + ' kcal</span>' +
                    '<button class="meal-delete" onclick="app.deleteMeal(\'' + this.currentDate + '\',' + i + ')">✕</button>' +
                    '</div></div>';
            }
        }
        document.getElementById('todayMeals').innerHTML = html;
    },

    getDayKcal(date) {
        var dayData = this.log[date];
        if (!dayData || !dayData.meals) return 0;
        return dayData.meals.reduce(function(s, m) { return s + (m.kcal || 0); }, 0);
    },

    changeDay(delta) {
        var d = new Date(this.currentDate);
        d.setDate(d.getDate() + delta);
        var newDate = d.getFullYear() + '-' +
            String(d.getMonth()+1).padStart(2,'0') + '-' +
            String(d.getDate()).padStart(2,'0');
        if (newDate > this.today()) return;
        this.currentDate = newDate;
        this.renderDashboard();
    },

    deleteMeal(date, index) {
        if (!this.log[date]) return;
        this.log[date].meals.splice(index, 1);
        this.renderDashboard();
        this.updateChart();
        this.saveLogBin();
    },

    // ── Log Modal ──────────────────────────────────
    openLogModal() {
        this.setLogType('ingredient', document.querySelector('[data-type="ingredient"]'));
        document.getElementById('logAmount').value = '';
        document.getElementById('logQuickName').value = '';
        document.getElementById('logCalcPreview').textContent = '';
        document.getElementById('logModal').classList.add('open');
    },

    closeLogModal() {
        document.getElementById('logModal').classList.remove('open');
    },

    setLogType(type, btn) {
        this.currentLogType = type;
        document.querySelectorAll('.type-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');

        var isQuick = type === 'quick';
        document.getElementById('logSelectRow').style.display = isQuick ? 'none' : '';
        document.getElementById('logNameRow').style.display  = isQuick ? '' : 'none';

        if (isQuick) {
            document.getElementById('logAmountLabel').textContent = 'Calories (kcal)';
            document.getElementById('logAmount').placeholder = 'e.g. 450';
            document.getElementById('logCalcPreview').textContent = '';
            // Remove live preview listeners
            document.getElementById('logItemSelect').onchange = null;
            document.getElementById('logAmount').oninput = null;
        } else {
            this.populateLogSelect();
            document.getElementById('logAmountLabel').textContent =
                type === 'recipe' ? 'Amount (g — per 100g of recipe)' : 'Amount (g / ml)';
            document.getElementById('logAmount').placeholder = 'e.g. 150';
        }
    },

    populateLogSelect() {
        var sel = document.getElementById('logItemSelect');
        sel.innerHTML = '';
        if (this.currentLogType === 'ingredient') {
            var names = Object.keys(this.ingredients).sort();
            for (var i = 0; i < names.length; i++) {
                var opt = document.createElement('option');
                opt.value = names[i];
                opt.textContent = names[i] + ' (' + this.ingredients[names[i]].kcal + ' kcal/' + this.ingredients[names[i]].unit + ')';
                sel.appendChild(opt);
            }
        } else {
            for (var i = 0; i < this.recipes.length; i++) {
                var r = this.recipes[i];
                var kcalPer100 = this.calcRecipeKcalPer100(r);
                var opt = document.createElement('option');
                opt.value = r.id;
                opt.textContent = r.name + ' (~' + Math.round(kcalPer100) + ' kcal/100g)';
                sel.appendChild(opt);
            }
        }

        var self = this;
        function update() {
            var amt = parseFloat(document.getElementById('logAmount').value) || 0;
            var kcal = 0;
            if (self.currentLogType === 'ingredient') {
                var ing = self.ingredients[sel.value];
                kcal = ing ? (ing.kcal * amt / 100) : 0;
            } else {
                var rec = self.recipes.find(function(r) { return String(r.id) === String(sel.value); });
                kcal = rec ? (self.calcRecipeKcalPer100(rec) * amt / 100) : 0;
            }
            document.getElementById('logCalcPreview').textContent = amt > 0 ? '≈ ' + Math.round(kcal) + ' kcal' : '';
        }

        sel.onchange = update;
        document.getElementById('logAmount').oninput = update;
    },

    calcRecipeKcalPer100(recipe) {
        var totalKcal = 0;
        var totalWeight = 0;
        if (!recipe.ingredients) return 0;
        for (var i = 0; i < recipe.ingredients.length; i++) {
            var ing = recipe.ingredients[i];
            var base = this.ingredients[ing.name ? ing.name.toLowerCase() : ''];
            if (base) totalKcal += base.kcal * (ing.amount / 100);
            totalWeight += ing.amount || 0;
        }
        return totalWeight > 0 ? (totalKcal / totalWeight * 100) : 0;
    },

    saveLogEntry() {
        var amt = parseFloat(document.getElementById('logAmount').value);

        // Quick kcal mode
        if (this.currentLogType === 'quick') {
            if (!amt || amt <= 0) { alert('Please enter a calorie amount.'); return; }
            var qname = document.getElementById('logQuickName').value.trim() || 'Meal';
            if (!this.log[this.currentDate]) this.log[this.currentDate] = { meals: [], note: '' };
            this.log[this.currentDate].meals.push({
                name: qname,
                amount: amt,
                unit: 'kcal',
                kcal: amt,
                type: 'quick',
                time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            });
            this.closeLogModal();
            this.renderDashboard();
            this.updateChart();
            this.saveLogBin();
            return;
        }

        var sel = document.getElementById('logItemSelect');
        if (!sel.value || !amt || amt <= 0) { alert('Please select an item and enter an amount.'); return; }

        var kcal = 0;
        var name = '';
        var unit = 'g';

        if (this.currentLogType === 'ingredient') {
            var ing = this.ingredients[sel.value];
            if (!ing) return;
            kcal = ing.kcal * amt / 100;
            name = sel.value;
            unit = ing.unit === '100ml' ? 'ml' : 'g';
        } else {
            var rec = this.recipes.find(function(r) { return String(r.id) === String(sel.value); });
            if (!rec) return;
            kcal = this.calcRecipeKcalPer100(rec) * amt / 100;
            name = rec.name;
        }

        if (!this.log[this.currentDate]) this.log[this.currentDate] = { meals: [], note: '' };
        this.log[this.currentDate].meals.push({
            name: name,
            amount: amt,
            unit: unit,
            kcal: kcal,
            type: this.currentLogType === 'recipe' ? 'recipe' : 'product',
            time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        });

        this.closeLogModal();
        this.renderDashboard();
        this.updateChart();
        this.saveLogBin();
    },

    // ── Goal ───────────────────────────────────────
    openGoalModal() {
        document.getElementById('goalInput').value = this.goal || '';
        document.getElementById('goalModal').classList.add('open');
    },

    closeGoalModal() {
        document.getElementById('goalModal').classList.remove('open');
    },

    saveGoal() {
        var val = parseInt(document.getElementById('goalInput').value);
        if (!val || val <= 0) { alert('Please enter a valid calorie goal.'); return; }
        this.goal = val;
        this.closeGoalModal();
        this.renderDashboard();
        this.updateChart();
        this.saveLogBin();
    },

    // ── Chart ──────────────────────────────────────
    setTimeframe(days, btn) {
        this.currentTimeframe = days;
        document.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('active');
        this.updateChart();
    },

    buildChart() {
        var ctx = document.getElementById('calorieChart').getContext('2d');
        var data = this.getChartData(this.currentTimeframe);

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: 'Calories',
                        data: data.values,
                        backgroundColor: function(ctx) {
                            var val = ctx.raw;
                            var goal = app.goal;
                            if (!goal) return 'rgba(232,255,90,0.7)';
                            return val > goal ? 'rgba(255,107,107,0.7)' : 'rgba(232,255,90,0.7)';
                        },
                        borderColor: function(ctx) {
                            var val = ctx.raw;
                            var goal = app.goal;
                            if (!goal) return '#e8ff5a';
                            return val > goal ? '#ff6b6b' : '#e8ff5a';
                        },
                        borderWidth: 1,
                        borderRadius: 6,
                        borderSkipped: false,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1a1e28',
                        borderColor: '#2e3448',
                        borderWidth: 1,
                        titleColor: '#f0f2f8',
                        bodyColor: '#e8ff5a',
                        titleFont: { family: 'Syne', weight: '700' },
                        bodyFont: { family: 'DM Mono' },
                        callbacks: {
                            label: function(ctx) { return ctx.raw + ' kcal'; }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: '#1a1e28', drawBorder: false },
                        ticks: { color: '#4a5270', font: { family: 'DM Mono', size: 11 } }
                    },
                    y: {
                        grid: { color: '#252a38', drawBorder: false },
                        ticks: { color: '#4a5270', font: { family: 'DM Mono', size: 11 } },
                        beginAtZero: true
                    }
                }
            }
        });

        if (this.goal > 0) this.addGoalLine();
    },

    addGoalLine() {
        if (!this.chart || !this.goal) return;
        var existing = this.chart.data.datasets.find(function(d) { return d.label === 'Goal'; });
        if (!existing) {
            this.chart.data.datasets.push({
                label: 'Goal',
                data: new Array(this.currentTimeframe).fill(this.goal),
                type: 'line',
                borderColor: '#5affd6',
                borderWidth: 1.5,
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false,
                tension: 0
            });
        } else {
            existing.data = new Array(this.currentTimeframe).fill(this.goal);
        }
        this.chart.update();
    },

    updateChart() {
        if (!this.chart) return;
        var data = this.getChartData(this.currentTimeframe);
        this.chart.data.labels = data.labels;
        this.chart.data.datasets[0].data = data.values;
        var goalDs = this.chart.data.datasets.find(function(d) { return d.label === 'Goal'; });
        if (goalDs) {
            goalDs.data = new Array(this.currentTimeframe).fill(this.goal);
        } else if (this.goal > 0) {
            this.addGoalLine();
            return;
        }
        this.chart.update();
    },

    getChartData(days) {
        var labels = [];
        var values = [];
        for (var i = days - 1; i >= 0; i--) {
            var d = new Date();
            d.setDate(d.getDate() - i);
            var key = d.getFullYear() + '-' +
                String(d.getMonth()+1).padStart(2,'0') + '-' +
                String(d.getDate()).padStart(2,'0');

            var label = '';
            if (days <= 7) {
                label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
            } else if (days <= 30) {
                label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            } else {
                label = i % 7 === 0
                    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    : '';
            }

            labels.push(label);
            values.push(Math.round(this.getDayKcal(key)));
        }
        return { labels: labels, values: values };
    },

    // ── Recipes Page ───────────────────────────────
    renderRecipesPage() {
        this.renderIngredients();
        this.renderRecipes();
        this.populateRecipeIngSelect();
    },

    renderIngredients(filter) {
        var entries = Object.entries(this.ingredients).sort(function(a,b) { return a[0].localeCompare(b[0]); });
        if (filter) {
            entries = entries.filter(function(e) { return e[0].toLowerCase().includes(filter.toLowerCase()); });
        }
        document.getElementById('ingCount').textContent = Object.keys(this.ingredients).length;
        var html = '';
        for (var i = 0; i < entries.length; i++) {
            var isCustom = !INGREDIENTS_DB[entries[i][0]];
            html += '<div class="data-item">' +
                '<div><div class="data-item-name">' + entries[i][0] + '</div>' +
                '<div class="data-item-meta">' + entries[i][1].unit + '</div></div>' +
                '<div class="data-item-right">' +
                '<span class="data-kcal">' + entries[i][1].kcal + ' kcal</span>' +
                (isCustom ? '<button class="data-delete" onclick="app.deleteIngredient(\'' + entries[i][0] + '\')">✕</button>' : '') +
                '</div></div>';
        }
        document.getElementById('ingredientsList').innerHTML = html || '<div style="color:var(--text3);padding:16px;text-align:center;">No results</div>';
    },

    filterIngredients() {
        this.renderIngredients(document.getElementById('ingSearch').value);
    },

    renderRecipes(filter) {
        document.getElementById('recCount').textContent = this.recipes.length;
        var list = this.recipes;
        if (filter) list = list.filter(function(r) { return r.name.toLowerCase().includes(filter.toLowerCase()); });
        var self = this;
        var html = '';
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            var kcalTotal = r.ingredients ? r.ingredients.reduce(function(s, ing) {
                var base = self.ingredients[ing.name ? ing.name.toLowerCase() : ''];
                return s + (base ? base.kcal * ing.amount / 100 : 0);
            }, 0) : 0;
            html += '<div class="data-item">' +
                '<div><div class="data-item-name">' + r.name + '</div>' +
                '<div class="data-item-meta">' + (r.ingredients ? r.ingredients.length : 0) + ' ingredients</div></div>' +
                '<div class="data-item-right">' +
                '<span class="data-kcal">' + Math.round(kcalTotal) + ' kcal</span>' +
                '<button class="data-delete" onclick="app.deleteRecipe(' + r.id + ')">✕</button>' +
                '</div></div>';
        }
        document.getElementById('recipesList').innerHTML = html || '<div style="color:var(--text3);padding:16px;text-align:center;">No recipes yet</div>';
    },

    filterRecipes() {
        this.renderRecipes(document.getElementById('recSearch').value);
    },

    // ── Ingredient Modal ───────────────────────────
    openIngredientModal() {
        document.getElementById('newIngName').value = '';
        document.getElementById('newIngKcal').value = '';
        document.getElementById('newIngUnit').value = '100g';
        document.getElementById('ingredientModal').classList.add('open');
    },

    closeIngredientModal() {
        document.getElementById('ingredientModal').classList.remove('open');
    },

    saveIngredient() {
        var name = document.getElementById('newIngName').value.trim().toLowerCase();
        var kcal = parseFloat(document.getElementById('newIngKcal').value);
        var unit = document.getElementById('newIngUnit').value;
        if (!name || !kcal) { alert('Please fill in all fields.'); return; }
        this.ingredients[name] = { kcal: kcal, unit: unit };
        this.closeIngredientModal();
        this.renderIngredients();
        this.populateRecipeIngSelect();
        this.saveRecipesBin();
    },

    deleteIngredient(name) {
        if (INGREDIENTS_DB[name]) return;
        if (!confirm('Delete "' + name + '"?')) return;
        delete this.ingredients[name];
        this.renderIngredients();
        this.saveRecipesBin();
    },

    // ── Recipe Modal ───────────────────────────────
    openRecipeModal() {
        this.editingRecipeId = null;
        this.currentRecipe = { name: '', ingredients: [], steps: [''] };
        document.getElementById('recipeModalTitle').textContent = 'New recipe';
        document.getElementById('recName').value = '';
        document.getElementById('recIngAmount').value = '';
        this.renderRecipeIngList();
        this.renderRecipeSteps();
        document.getElementById('recTotal').textContent = '';
        document.getElementById('recipeModal').classList.add('open');
    },

    closeRecipeModal() {
        document.getElementById('recipeModal').classList.remove('open');
    },

    populateRecipeIngSelect() {
        var sel = document.getElementById('recIngSelect');
        sel.innerHTML = '';
        var names = Object.keys(this.ingredients).sort();
        for (var i = 0; i < names.length; i++) {
            var opt = document.createElement('option');
            opt.value = names[i];
            opt.textContent = names[i];
            sel.appendChild(opt);
        }
    },

    addRecipeIngredient() {
        var name = document.getElementById('recIngSelect').value;
        var amount = parseFloat(document.getElementById('recIngAmount').value);
        if (!name || !amount || amount <= 0) { alert('Select an ingredient and enter an amount.'); return; }
        this.currentRecipe.ingredients.push({ name: name, amount: amount });
        document.getElementById('recIngAmount').value = '';
        this.renderRecipeIngList();
        this.updateRecipeTotal();
    },

    renderRecipeIngList() {
        var self = this;
        var html = '';
        for (var i = 0; i < this.currentRecipe.ingredients.length; i++) {
            var ing = this.currentRecipe.ingredients[i];
            var base = this.ingredients[ing.name.toLowerCase()];
            var kcal = base ? Math.round(base.kcal * ing.amount / 100) : 0;
            html += '<div class="rec-ing-item">' +
                '<span>' + ing.name + ' — ' + ing.amount + 'g (' + kcal + ' kcal)</span>' +
                '<button onclick="app.removeRecipeIng(' + i + ')">✕</button>' +
                '</div>';
        }
        document.getElementById('recIngList').innerHTML = html;
    },

    removeRecipeIng(i) {
        this.currentRecipe.ingredients.splice(i, 1);
        this.renderRecipeIngList();
        this.updateRecipeTotal();
    },

    updateRecipeTotal() {
        var self = this;
        var total = this.currentRecipe.ingredients.reduce(function(s, ing) {
            var base = self.ingredients[ing.name.toLowerCase()];
            return s + (base ? base.kcal * ing.amount / 100 : 0);
        }, 0);
        document.getElementById('recTotal').textContent = total > 0 ? 'Total: ' + Math.round(total) + ' kcal' : '';
    },

    addRecipeStep() {
        this.currentRecipe.steps.push('');
        this.renderRecipeSteps();
    },

    renderRecipeSteps() {
        var html = '';
        for (var i = 0; i < this.currentRecipe.steps.length; i++) {
            html += '<div class="step-row">' +
                '<span class="step-num">' + (i+1) + '.</span>' +
                '<textarea placeholder="Describe this step..." oninput="app.currentRecipe.steps[' + i + ']=this.value" rows="2">' +
                (this.currentRecipe.steps[i] || '') + '</textarea>' +
                (i > 0 ? '<button onclick="app.removeRecipeStep(' + i + ')">✕</button>' : '') +
                '</div>';
        }
        document.getElementById('recStepsList').innerHTML = html;
    },

    removeRecipeStep(i) {
        this.currentRecipe.steps.splice(i, 1);
        this.renderRecipeSteps();
    },

    saveRecipe() {
        var name = document.getElementById('recName').value.trim();
        if (!name) { alert('Please enter a recipe name.'); return; }
        if (this.currentRecipe.ingredients.length === 0) { alert('Add at least one ingredient.'); return; }

        var self = this;
        var total = this.currentRecipe.ingredients.reduce(function(s, ing) {
            var base = self.ingredients[ing.name.toLowerCase()];
            return s + (base ? base.kcal * ing.amount / 100 : 0);
        }, 0);

        var recipe = {
            id: this.editingRecipeId || Date.now(),
            name: name,
            ingredients: this.currentRecipe.ingredients.slice(),
            steps: this.currentRecipe.steps.filter(function(s) { return s.trim(); }),
            totalCalories: Math.round(total),
            categories: [],
            tags: [],
            createdAt: new Date().toISOString()
        };

        if (this.editingRecipeId) {
            for (var i = 0; i < this.recipes.length; i++) {
                if (this.recipes[i].id === this.editingRecipeId) { this.recipes[i] = recipe; break; }
            }
        } else {
            this.recipes.push(recipe);
        }

        this.closeRecipeModal();
        this.renderRecipes();
        this.saveRecipesBin();
    },

    deleteRecipe(id) {
        if (!confirm('Delete this recipe?')) return;
        this.recipes = this.recipes.filter(function(r) { return r.id !== id; });
        this.renderRecipes();
        this.saveRecipesBin();
    }
};

document.addEventListener('DOMContentLoaded', function() { app.init(); });
