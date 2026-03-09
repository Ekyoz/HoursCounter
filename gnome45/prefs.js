import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class HoursCounterPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.hours-counter');

        const page = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_start: 30, margin_end: 30, margin_top: 30, margin_bottom: 30,
            spacing: 15
        });

        // --- GROUP: GOALS ---
        let goalLabel = new Gtk.Label({
            label: "<b>Goals</b>",
            use_markup: true,
            halign: Gtk.Align.START
        });
        page.append(goalLabel);

        let groupGoal = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE });
        groupGoal.add_css_class('boxed-list');

        let spinGoal = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 24, step_increment: 1, page_increment: 1 }),
            valign: Gtk.Align.CENTER
        });
        settings.bind('goal-hours', spinGoal, 'value', Gio.SettingsBindFlags.DEFAULT);
        groupGoal.append(this._createRow("Daily goal (hours)", spinGoal));
        page.append(groupGoal);

        // --- GROUP: INTERFACE ---
        let interfaceLabel = new Gtk.Label({
            label: "<b>Interface</b>",
            use_markup: true,
            halign: Gtk.Align.START,
            margin_top: 10
        });
        page.append(interfaceLabel);

        let groupDisplay = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE });
        groupDisplay.add_css_class('boxed-list');

        let switchRemaining = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        settings.bind('show-remaining-time', switchRemaining, 'active', Gio.SettingsBindFlags.DEFAULT);
        groupDisplay.append(this._createRow("Show remaining time in panel", switchRemaining));

        // Language selector
        let langCombo = new Gtk.DropDown({
            model: Gtk.StringList.new(["English", "Français"]),
            valign: Gtk.Align.CENTER
        });

        langCombo.selected = settings.get_string('language') === 'fr' ? 1 : 0;

        langCombo.connect('notify::selected', (w) => {
            settings.set_string('language', w.selected === 1 ? 'fr' : 'en');
        });
        groupDisplay.append(this._createRow("Language / Langue", langCombo));

        page.append(groupDisplay);

        // --- GROUP: COLORS ---
        let colorsLabel = new Gtk.Label({
            label: "<b>Status Colors (Hexadecimal)</b>",
            use_markup: true,
            halign: Gtk.Align.START,
            margin_top: 10
        });
        page.append(colorsLabel);

        let groupColors = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE });
        groupColors.add_css_class('boxed-list');

        const colors = [
            { key: 'color-warning', label: 'In Progress (Orange)' },
            { key: 'color-success', label: 'Completed (Green)' },
            { key: 'color-overtime', label: 'Overtime (Blue)' }
        ];

        colors.forEach(c => {
            let entry = new Gtk.Entry({ valign: Gtk.Align.CENTER, placeholder_text: "#HEX" });
            settings.bind(c.key, entry, 'text', Gio.SettingsBindFlags.DEFAULT);
            groupColors.append(this._createRow(c.label, entry));
        });
        page.append(groupColors);

        // Add page to window
        window.set_default_size(450, 500);
        window.set_child(page);
    }

    _createRow(label, widget) {
        let row = new Gtk.ListBoxRow();
        let box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 20,
            margin_start: 10, margin_end: 10, margin_top: 10, margin_bottom: 10
        });
        let lbl = new Gtk.Label({ label: label, halign: Gtk.Align.START, hexpand: true });
        box.append(lbl);
        box.append(widget);
        row.set_child(box);
        return row;
    }
}
