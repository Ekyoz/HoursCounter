const { St, Clutter, GObject, GLib, Gio, Shell } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const ModalDialog = imports.ui.modalDialog;

let indicator, _timeout, _settings;
let historyData = {}; 
let savePath;

const Translations = {
    'en': {
        'history': 'Hours History',
        'week': 'Week',
        'month': 'Month',
        'close': 'Close',
        'total': 'Total',
        'average': 'Average',
        'day': 'day',
        'this_week': 'This Week',
        'this_month': 'This Month',
        'no_history': 'No history',
        'today': 'Today',
        'yesterday': 'Yesterday',
        'remaining': 'remaining',
        'view_all': 'View all {n} days...',
        'not_logged': 'Not logged today',
        'planned': 'Planned',
        'locale': 'en-US'
    },
    'fr': {
        'history': 'Historique des heures',
        'week': 'Semaine',
        'month': 'Mois',
        'close': 'Fermer',
        'total': 'Total',
        'average': 'Moyenne',
        'day': 'jour',
        'this_week': 'Cette semaine',
        'this_month': 'Ce mois-ci',
        'no_history': 'Aucun historique',
        'today': "Aujourd'hui",
        'yesterday': 'Hier',
        'remaining': 'restant',
        'view_all': 'Voir les {n} jours...',
        'not_logged': 'Non connecté ce jour',
        'planned': 'Prévu',
        'locale': 'fr-FR'
    }
};

const HistoryDialog = GObject.registerClass(
class HistoryDialog extends ModalDialog.ModalDialog {
    _init() {
        super._init({ styleClass: 'history-dialog' });
        
        this._currentFilter = 'week'; 
        this._referenceDate = new Date(); 
        
        // --- Header ---
        let headerBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 15px; margin-bottom: 15px;'
        });
        
        let title = new St.Label({
            text: this._t('history'),
            style: 'font-weight: bold; font-size: 18px; min-width: 120px;',
            y_align: Clutter.ActorAlign.CENTER
        });
        headerBox.add_child(title);
        
        let filterBox = new St.BoxLayout({
            style: 'spacing: 10px;',
            x_align: Clutter.ActorAlign.END,
            x_expand: true
        });
        
        this._weekButton = this._createFilterButton(this._t('week'), 'week');
        this._monthButton = this._createFilterButton(this._t('month'), 'month');
        
        filterBox.add_child(this._weekButton);
        filterBox.add_child(this._monthButton);
        headerBox.add_child(filterBox);
        this.contentLayout.add_child(headerBox);
        
        this._topControls = new St.BoxLayout({ vertical: true, style: 'spacing: 10px; margin-bottom: 10px;' });
        this.contentLayout.add_child(this._topControls);

        this._navBox = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 10px; background-color: #333; border-radius: 5px; height: 35px;',
            x_align: Clutter.ActorAlign.CENTER
        });

        let prevBtn = new St.Button({ label: '<', style_class: 'button', style: 'padding: 5px 20px;' });
        prevBtn.connect('clicked', () => this._changePeriod(-1));
        
        this._periodLabel = new St.Label({
            text: '',
            style: 'font-weight: bold; font-size: 14px;',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        
        let nextBtn = new St.Button({ label: '>', style_class: 'button', style: 'padding: 5px 20px;' });
        nextBtn.connect('clicked', () => this._changePeriod(1));

        this._navBox.add_child(prevBtn);
        this._navBox.add_child(this._periodLabel);
        this._navBox.add_child(nextBtn);
        
        this._navSpacer = new St.BoxLayout({ style: 'height: 20px;' });

        this._topControls.add_child(this._navBox);
        this._topControls.add_child(this._navSpacer);

        this._statsBar = new St.BoxLayout({
            vertical: false,
            style: 'padding: 10px; background-color: #1e1e1e; border-radius: 5px; border: 1px solid #444; spacing: 30px;',
            x_align: Clutter.ActorAlign.FILL
        });
        this._topControls.add_child(this._statsBar);

        this._totalLabel = new St.Label({ style: 'font-weight: bold;' });
        this._avgLabel = new St.Label({ style: 'font-weight: bold;' });
        this._statsBar.add_child(this._totalLabel);
        this._statsBar.add_child(this._avgLabel);
        
        let scrollView = new St.ScrollView({
            style: 'height: 460px; width: 900px; border: 1px solid #444; border-radius: 4px; background-color: #2e2e2e;',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC
        });
        
        this._historyBox = new St.BoxLayout({ vertical: true, style: 'padding: 10px; spacing: 0px;' });
        scrollView.add_actor(this._historyBox);
        this.contentLayout.add_child(scrollView);
        
        this._setFilter('week');
        
        this.addButton({ label: this._t('close'), action: () => this.close(), key: Clutter.KEY_Escape });
    }

    _t(key) {
        let lang = _settings.get_string('language') || 'en';
        return Translations[lang][key] || Translations['en'][key];
    }

    _createFilterButton(label, filterType) {
        let btn = new St.Button({
            label: label,
            style_class: 'button',
            style: 'padding: 6px 15px; background-color: #555; border-radius: 4px;'
        });
        btn.connect('clicked', () => this._setFilter(filterType));
        return btn;
    }
    
    _setFilter(filter) {
        this._currentFilter = filter;
        this._referenceDate = new Date();
        
        const activeStyle = 'padding: 6px 15px; background-color: #4CAF50; border-radius: 4px; font-weight: bold;';
        const inactiveStyle = 'padding: 6px 15px; background-color: #555; border-radius: 4px;';
        
        this._weekButton.style = filter === 'week' ? activeStyle : inactiveStyle;
        this._monthButton.style = filter === 'month' ? activeStyle : inactiveStyle;
        
        this._updateNavLabel();
        this._buildCompleteHistory();
    }

    _changePeriod(direction) {
        if (this._currentFilter === 'week') {
            this._referenceDate.setDate(this._referenceDate.getDate() + (direction * 7));
        } else if (this._currentFilter === 'month') {
            this._referenceDate.setMonth(this._referenceDate.getMonth() + direction);
        }
        this._updateNavLabel();
        this._buildCompleteHistory();
    }

    _updateNavLabel() {
        let labelText = '';
        let today = new Date();
        let isCurrent = false;

        if (this._currentFilter === 'week') {
            let start = this._getStartOfWeek(this._referenceDate);
            let end = new Date(start);
            end.setDate(start.getDate() + 6);
            let currentStart = this._getStartOfWeek(today);
            if (start.getTime() === currentStart.getTime()) isCurrent = true;
            labelText = `${start.toLocaleDateString(this._t('locale'))} - ${end.toLocaleDateString(this._t('locale'))}`;
        } else {
            if (this._referenceDate.getMonth() === today.getMonth() && 
                this._referenceDate.getFullYear() === today.getFullYear()) isCurrent = true;
            labelText = this._referenceDate.toLocaleDateString(this._t('locale'), { month: 'long', year: 'numeric' });
        }

        if (isCurrent) {
            labelText = (this._currentFilter === 'week') ? this._t('this_week') : this._t('this_month');
        }
        this._periodLabel.set_text(labelText);
    }

    _getStartOfWeek(date) {
        let d = new Date(date);
        let day = d.getDay(); 
        let diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    _buildCompleteHistory() {
        this._historyBox.destroy_all_children();
        let dateKeys = this._getDateRange();
        let goalHours = _settings.get_int('goal-hours') || 8;

        // Fetch colors from settings
        let colorWarning = _settings.get_string('color-warning');
        let colorSuccess = _settings.get_string('color-success');
        let colorOvertime = _settings.get_string('color-overtime');

        let totalSecondsPeriod = 0;
        let loggedDaysCount = 0;

        dateKeys.forEach(dateKey => {
            let isSimulation = dateKey.startsWith("future");
            let hasData = !isSimulation && historyData[dateKey] !== undefined && historyData[dateKey] > 0;
            let totalSeconds = hasData ? historyData[dateKey] : 0;
            
            if (hasData) {
                totalSecondsPeriod += totalSeconds;
                loggedDaysCount++;
            }

            let row = new St.BoxLayout({
                style: 'height: 60px; spacing: 15px; padding: 0 15px; border-bottom: 1px solid #333; background-color: #252525;',
                x_expand: true,
                vertical: false,
                y_align: Clutter.ActorAlign.CENTER
            });

            let [y, m, d] = dateKey.split('-').map(Number);
            let displayDate = isSimulation ? "Upcoming" : new Date(y, m-1, d).toLocaleDateString(this._t('locale'), { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long' 
            });

            row.add_child(new St.Label({
                text: displayDate,
                style: `min-width: 200px; font-weight: bold; ${hasData ? 'color: #ddd;' : 'color: #666;'}`,
                y_align: Clutter.ActorAlign.CENTER
            }));

            if (hasData) {
                let barContainer = new St.BoxLayout({ x_expand: true, y_align: Clutter.ActorAlign.CENTER });
                let progress = totalSeconds / (goalHours * 3600);
                let visualWidth = Math.min(progress, 1.0) * 350; 
                
                let statusColor = colorWarning; 
                if (progress >= 1.05) statusColor = colorOvertime; 
                else if (progress >= 1.0) statusColor = colorSuccess; 

                let barBg = new St.Widget({ 
                    style: 'background-color: #444; height: 12px; border-radius: 6px; width: 350px;',
                    y_align: Clutter.ActorAlign.CENTER
                });
                
                barBg.add_child(new St.Widget({
                    style: `background-color: ${statusColor}; height: 12px; border-radius: 6px; width: ${visualWidth}px;`,
                    y_align: Clutter.ActorAlign.CENTER
                }));
                barContainer.add_child(barBg);
                row.add_child(barContainer);

                row.add_child(new St.Label({ 
                    text: `${Math.round(progress * 100)}%`, 
                    style: 'min-width: 55px; text-align: left; font-weight: bold; color: #ffffff;',
                    y_align: Clutter.ActorAlign.CENTER 
                }));

                row.add_child(new St.Widget({
                    style: 'width: 1px; height: 24px; background-color: #444; margin: 0 10px;',
                    y_align: Clutter.ActorAlign.CENTER
                }));

                let h = Math.floor(totalSeconds / 3600);
                let min = Math.floor((totalSeconds % 3600) / 60);
                row.add_child(new St.Label({ 
                    text: `${h}h ${min}m`, 
                    style: `min-width: 90px; text-align: right; font-weight: bold; color: ${statusColor};`,
                    y_align: Clutter.ActorAlign.CENTER 
                }));

            } else {
                let statusLabel = new St.Label({
                    text: isSimulation ? this._t("planned") : this._t("not_logged"),
                    style: 'color: #666; font-style: italic; margin-left: 0px;',
                    y_align: Clutter.ActorAlign.CENTER,
                    x_expand: true
                });
                row.add_child(statusLabel);
            }

            this._historyBox.add_child(row);
        });

        this._updateStats(totalSecondsPeriod, loggedDaysCount);
    }

    _updateStats(totalSeconds, daysCount) {
        let h = Math.floor(totalSeconds / 3600);
        let m = Math.floor((totalSeconds % 3600) / 60);
        this._totalLabel.set_text(`${this._t('total')}: ${h}h ${m}m`);

        if (daysCount > 0) {
            let avgSeconds = totalSeconds / daysCount;
            let ah = Math.floor(avgSeconds / 3600);
            let am = Math.floor((avgSeconds % 3600) / 60);
            this._avgLabel.set_text(`${this._t('average')}: ${ah}h ${am}m / day`);
        } else {
            this._avgLabel.set_text(`${this._t('average')}: 0h 00m`);
        }
    }

    _getDateRange() {
        let dates = [];
        let startDate, count;
        if (this._currentFilter === 'week') {
            startDate = this._getStartOfWeek(this._referenceDate);
            count = 7;
        } else {
            startDate = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth(), 1);
            count = new Date(this._referenceDate.getFullYear(), this._referenceDate.getMonth() + 1, 0).getDate();
        }
        for (let i = 0; i < count; i++) {
            let d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            dates.push(`${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`);
        }
        return dates; 
    }
});

const HoursCounterIndicator = GObject.registerClass(
class HoursCounterIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, "HoursCounter", false); 

        this._box = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 10px;'
        });
        
        this.label = new St.Label({
            text: "00h 00m",
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this.label);
        
        this._timeRemainingLabel = new St.Label({
            text: "",
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._timeRemainingLabel);
        
        this.add_child(this._box);
        
        let menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP, 0);
        this.setMenu(menu);
        
        this._buildMenu();

        // Settings change listeners
        _settings.connect('changed::show-remaining-time', () => {
            this._updateVisibility();
        });
        this._updateVisibility();
    }

    _t(key) {
        let lang = _settings.get_string('language') || 'en';
        return Translations[lang][key] || Translations['en'][key];
    }

    _updateVisibility() {
        let show = _settings.get_boolean('show-remaining-time');
        this._timeRemainingLabel.visible = show;
    }
    
    updateTimeRemaining(currentSeconds, goalHours) {
        let goalSeconds = goalHours * 3600;
        let remaining = goalSeconds - currentSeconds;
        let colorSuccess = _settings.get_string('color-success');
        
        if (remaining <= 0) {
            let overtime = Math.abs(remaining);
            let overtimeHours = Math.floor(overtime / 3600);
            let overtimeMinutes = Math.floor((overtime % 3600) / 60);
            this._timeRemainingLabel.set_text(`(+${overtimeHours}h ${overtimeMinutes}m)`);
            this._timeRemainingLabel.style = `color: ${colorSuccess};`;
        } else {
            let hours = Math.floor(remaining / 3600);
            let minutes = Math.floor((remaining % 3600) / 60);
            this._timeRemainingLabel.set_text(`(${hours}h ${minutes}m ${this._t('remaining')})`);
            this._timeRemainingLabel.style = 'color: #888;';
        }
    }
    
    _buildMenu() {
        let headerItem = new PopupMenu.PopupMenuItem(this._t('history'), { reactive: false });
        headerItem.label.style = "font-weight: bold;";
        this.menu.addMenuItem(headerItem);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        this._historySection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._historySection);
        
        this._updateHistoryList();
    }
    
    _updateHistoryList() {
        this._historySection.removeAll();
        
        let dates = Object.keys(historyData).sort().reverse();
        
        if (dates.length === 0) {
            let emptyItem = new PopupMenu.PopupMenuItem(this._t("no_history"), { reactive: false });
            emptyItem.label.style = "font-style: italic; color: #888;";
            this._historySection.addMenuItem(emptyItem);
            return;
        }

        let colorWarning = _settings.get_string('color-warning');
        let colorSuccess = _settings.get_string('color-success');
        let colorOvertime = _settings.get_string('color-overtime');
        
        let displayDates = dates.slice(0, 10);
        
        displayDates.forEach(dateKey => {
            let totalSeconds = historyData[dateKey];
            let hours = Math.floor(totalSeconds / 3600);
            let minutes = Math.floor((totalSeconds % 3600) / 60);
            
            let [year, month, day] = dateKey.split('-').map(Number);
            let date = new Date(year, month - 1, day);
            let today = new Date();
            today.setHours(0, 0, 0, 0);
            let dateObj = new Date(year, month - 1, day);
            dateObj.setHours(0, 0, 0, 0);
            
            let dateLabel;
            let isToday = false;
            if (dateObj.getTime() === today.getTime()) {
                dateLabel = this._t('today');
                isToday = true;
            } else {
                let yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                if (dateObj.getTime() === yesterday.getTime()) {
                    dateLabel = this._t("yesterday");
                } else {
                    dateLabel = date.toLocaleDateString(this._t('locale'), { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric' 
                    });
                }
            }
            
            let item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
            
            let box = new St.BoxLayout({ 
                vertical: false, 
                style_class: 'history-item-box',
                style: 'spacing: 15px;'
            });
            
            let dateStyle = isToday 
                ? 'min-width: 90px; font-weight: bold; color: #ffffff;'
                : 'min-width: 90px; font-weight: bold;';
            
            let dateText = new St.Label({ 
                text: dateLabel,
                style: dateStyle,
                y_align: Clutter.ActorAlign.CENTER
            });
            box.add_child(dateText);
            
            let progressBox = new St.BoxLayout({ 
                vertical: true,
                style: 'spacing: 5px;',
                x_expand: true
            });
            
            let goalHours = _settings.get_int('goal-hours');
            let actualHours = totalSeconds / 3600;
            let progress = actualHours / goalHours;
            let progressPercent = Math.round(progress * 100);
            
            let hoursTextContent = `${hours}h ${minutes}m`;
            if (progress > 1.0) {
                let overtimeSeconds = totalSeconds - (goalHours * 3600);
                let overtimeHours = Math.floor(overtimeSeconds / 3600);
                let overtimeMinutes = Math.floor((overtimeSeconds % 3600) / 60);
                hoursTextContent += ` (+${overtimeHours}h ${overtimeMinutes}m)`;
            }
            
            let hoursText = new St.Label({ 
                text: hoursTextContent,
                style: 'font-size: 12px;'
            });
            progressBox.add_child(hoursText);
            
            let visualProgress = Math.min(progress, 1.0);
            
            let progressBarBg = new St.Widget({
                style: 'background-color: #333; height: 8px; border-radius: 4px; min-width: 120px;'
            });
            
            let barColor = colorWarning; 
            if (progress >= 1.05) barColor = colorOvertime;
            else if (progress >= 1.0) barColor = colorSuccess;
            
            let progressBarFill = new St.Widget({
                style: `background-color: ${barColor}; height: 8px; border-radius: 4px;`,
                width: Math.round(120 * visualProgress)
            });
            
            progressBarBg.add_child(progressBarFill);
            progressBox.add_child(progressBarBg);
            
            box.add_child(progressBox);
            
            let percentText = new St.Label({ 
                text: `${progressPercent}%`,
                style: 'min-width: 45px; text-align: right;',
                y_align: Clutter.ActorAlign.CENTER
            });
            box.add_child(percentText);
            
            item.actor.add_child(box);
            this._historySection.addMenuItem(item);
        });
        
        if (dates.length > 10) {
            this._historySection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            let labelTemplate = this._t('view_all');
            let labelText = labelTemplate.replace('{n}', dates.length);

            let viewAllButton = new PopupMenu.PopupMenuItem(labelText);
            viewAllButton.connect('activate', () => {
                this._openHistoryDialog();
            });
            this._historySection.addMenuItem(viewAllButton);
        }
    }
    
    _openHistoryDialog() {
        let dialog = new HistoryDialog();
        dialog.open();
    }
    
    updateHistory() {
        if (this._historySection) {
            this._updateHistoryList();
        }
    }
});

function init() {
    savePath = GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', 'hours-counter@atresall.counter.fr', 'history.json']);
}

function loadHistory() {
    if (GLib.file_test(savePath, GLib.FileTest.EXISTS)) {
        try {
            let [success, content] = GLib.file_get_contents(savePath);
            if (success) {
                let contents = new TextDecoder().decode(content);
                historyData = JSON.parse(contents);
            }
        } catch (e) { 
            log('Error loading history:', e);
            historyData = {}; 
        }
    }
}

function saveHistory() {
    try {
        GLib.file_set_contents(savePath, JSON.stringify(historyData));
    } catch (e) { }
}

function updateTimer() {
    let now = new Date();
    let todayKey = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;

    if (!historyData[todayKey]) historyData[todayKey] = 0;
    historyData[todayKey] += 1;

    let goalHours = _settings.get_int('goal-hours');
    let totalSeconds = historyData[todayKey];
    let h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    let m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    
    indicator.label.set_text(`${h}h ${m}m`);
    
    indicator.updateTimeRemaining(totalSeconds, goalHours);

    if (totalSeconds % 60 === 0) {
        saveHistory();
        if (indicator) {
            indicator.updateHistory();
        }
    }
    
    return true;
}

function enable() {
    _settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.hours-counter');
    loadHistory();
    indicator = new HoursCounterIndicator();
    Main.panel.addToStatusArea("hours-counter-indicator", indicator);
    _timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, updateTimer);
}

function disable() {
    saveHistory(); 
    if (_timeout) GLib.Source.remove(_timeout);
    if (indicator) indicator.destroy();
}