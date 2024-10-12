class TableOrder {
    constructor(options) {
        Object.assign(this, options);

        this.items = [];
        this.edit_form = null;
        this.divide_account_modal = null;
        this.pay_form = null;
        this.current_item = null;
        this.button = null;
        this.item_pending_to_send_status = ["Adding", null, undefined, ""];
        this.make();

        RM.object(this.data.name, this);
        window.test_order = this;
    }

    make_invoice() {
        //this.invoice = new Invoice(this.data);
    }

    reset_data(data, action) {
        this.data = data.order.data;
        this.check_items({
            items: data.items,
            current: this.current_item,
            action: action
        });

        if (this.order_manage.is_same_order(this)) {
            this.render();
        } else {
            this.show_items_count();
        }
    }

    remove() {
        this.order_manage.delete_order(this.data.name);
    }

    make() {
        setTimeout(() => {
            if (this.button) this.button.remove();
            let font_color = "";

            if (!RM.check_permissions("order", this, "write")) {
                font_color = `color: ${RM.restrictions.color};`;
            }

            this.container = frappe.jshtml({
                tag: "div",
                properties: { style: "display: none;", class: `order-entry-container hide` },
                wrapper: this.order_manage.order_entry_container
            });

            this.button = frappe.jshtml({
                tag: "button",
                properties: {
                    class: "btn btn-app btn-lg btn-order",
                    style: `${font_color}; background-color: var(--fill_color)`
                },
                content: this.content,
                text: this.data.items_count,
                wrapper: this.order_manage.order_container,
            }).on("click", () => {
                if (RM.busy_message()) {
                    return;
                }
                this.select();
            });
        }, 0);
    }

    get content() {
        const background_color = `background-color: ${RM.check_permissions("order", this, "write") ? '' : RM.restrictions.color};`;
        return `<span class='badge badge-tag' style="${background_color}">{{text}}</span>${this.data.short_name}`;
    }

    hide_items() {
        this.in_items((item) => {
            item.hide();
        });
    }

    delete_items() {
        this.in_items((item, key) => {
            item.remove();
            delete this.items[key];
        });
    }

    select(via_click = true) {
        this.order_manage.current_order = this;

        setTimeout(() => {
            this.order_manage.current_order_identifier = this.data.name;
            this.button.toggle_common('btn-order', 'selected');
            this.container.toggle_common('order-entry-container', 'active');

            this.container.show();

            if (via_click) {
                if (!this.data.customer) {
                    this.order_manage.components.customer.highlight();
                    this.set_customer();
                }
                this.get_items();
            } else {
                this.order_manage.order_status_message("from select order");
                this.order_manage.check_buttons_status();
            }

            if (this.data.customer) {
                this.make_invoice();
            }

            this.order_manage.toggle_main_section();
        }, 0);

        return this;
    }

    in_items(f) {
        let index = 0;
        Object.keys(this.items).forEach((k) => {
            f(this.get_item(k), k, index);
            index++;
        });
    }

    has_queue_items() {
        let has = false;
        this.in_items(item => {
            if (this.item_pending_to_send_status.includes(item.data.status)) {
                has = true;
            }
        });
        return has;
    }

    push_item(new_item) {
        if (!this.data.customer) {
            this.order_manage.components.customer.highlight();
            frappe.throw(__("Please set a Customer"));
        }

        let test_item = null;
        this.in_items(item => {
            if (item.data.item_code === new_item.item_code) {
                if ([this.data.attending_status, "Pending", "Add", "", null, "undefined"].includes(item.data.status)) {
                    item.data.qty += 1;
                    item.data.item_tax_rate = new_item.item_tax_rate;
                    item.data.status = "Pending";
                    item.calculate();
                    test_item = item;
                }
            }
        });

        test_item = test_item || this.add_locale_item(new_item);
        if (test_item != null) {
            test_item.update();
            test_item.select(true);
        }
    }

    add_locale_item(item) {
        const identifier = item.identifier;
        this.items[identifier] = new OrderItem({
            identifier: identifier,
            order: this,
            data: Object.assign({ identifier: identifier }, item)
        });

        return this.get_item(identifier);
    }

    render() {
        this.show_items_count();
        this.aggregate();
    }

    aggregate(locale = false) {
        if (this.order_manage.is_same_order(this)) {
            let tax = this.data.tax;
            let amount = this.data.amount;

            if (locale) {
                tax = 0;
                amount = 0;
                this.in_items(item => {
                    tax += item.data.tax_amount;
                    amount += item.data.amount;
                });
            }

            this.order_manage.components.Tax.val(`${__("Tax")}: ${RM.format_currency(tax)}`);
            this.order_manage.components.Total.val(`${__("Total")}: ${RM.format_currency(amount)}`);
        }
    }

    check_items(options = {}) {
        const items = options.items || [];
        const action = options.action || null;
        const current = options.current || this.current_item;

        let test_item = null, current_item = null;

        items.forEach((item, index) => {
            test_item = this.get_item(item.identifier) || this.add_locale_item(item);
            if (test_item != null) {
                test_item.data = item;
                test_item.update(false);
            }

            if (test_item != null && test_item.data.qty > 0) {
                test_item.order = this;
                if (index === items.length - 1 && this.current_item == null) current_item = test_item;
            }
        });

        if ([QUEUE, SPLIT, null].includes(action)) {
            this.debug_items(items);
        }

        if (current != null) current_item = this.get_item(current.data.identifier);

        if (this.order_manage.is_same_order(this)) {
            this.order_manage.order_status_message("from check item");
            setTimeout(() => {
                this.order_manage.check_buttons_status();

                if (current_item == null) {
                    if (this.items_count) {
                        this.select_first_item();
                    } else {
                        this.order_manage.check_item_editor_status();
                    }
                } else {
                    current_item.select(action == null);
                }
            }, 0);
        }
    }

    debug_items(items) {
        const test_items = items.map(item => item.identifier);

        Object.keys(this.items).filter(x => !test_items.includes(x)).forEach((r) => {
            this.delete_item(r);
        });
    }

    get_item(identifier) {
        const item = this.items[identifier];
        return typeof item == "undefined" ? null : item;
    }

    get items_count() {
        return Object.keys(this.items).length;
    }

    items_data() {
        return Object.keys(this.items).map((key) => this.items[key].data);
    }

    scroller() {
        const order_entry_container = this.order_manage.order_entry_container;

        const container_height = order_entry_container.offsetHeight;
        const row_height = (container_height / this.items_count);
        const position_row = (this.find_item_position(this.current_item) * row_height);

        const container = $(this.order_manage.container).find('.panel-order-items')[0];
        container.scrollTo({ top: position_row, behavior: 'smooth' });
    }

    find_item_position(test_item) {
        return Object.keys(this.items).indexOf(test_item.data.identifier);
    }

    get_items() {
        RM.working(__("Loading items in") + ": " + this.data.name);
        frappeHelper.api.call({
            model: "Table Order",
            name: this.data.name,
            method: "get_items",
            always: (r) => {
                RM.ready();
                if (typeof r.message != "undefined") {
                    this.data = r.message.order.data;
                    this.render();
                    this.check_items({ items: r.message.items });
                }
            },
        });
    }

    delete() {
        if (RM.busy_message()) {
            return;
        }

        RM.working("Deleting Order");
        frappeHelper.api.call({
            model: "Table Order",
            name: this.data.name,
            method: "_delete",
            always: () => {
                RM.ready();
            },
        });
    }

    show_items_count() {
        this.button.val(this.data.items_count);
    }

    divide() {
        if (this.divide_account_modal == null) {
            this.divide_account_modal = new DeskModal({
                model: "Table Order",
                model_name: this.data.name,
                action: "divide_template",
                /*"full_page": true,*/
                from_server: true,
                customize: true,
                adjust_height: 25,
                set_buttons: true,
                callback: () => {
                    this.make_divide_account();
                }
            });
        } else {
            this.divide_account_modal.set_buttons = false;
            this.divide_account_modal.show();
            this.divide_account_modal.reload(() => {
                this.make_divide_account(false);
            });
        }
    }

    transfer() {
        RM.working("Transferring Order");
        RM.transfer_order = this;
        this.order_manage.close();
    }

    make_divide_account() {
        if (this.divide_account_modal.set_buttons) {
            RMHelper.return_main_button(
                `${this.data.name} (${__("Divide Account")})`,
                () => this.divide_account_modal.hide(),
                this.divide_account_modal.title_container
            );

            RMHelper.default_button(
                'Divide',
                'ok',
                () => this._divide(),
                DOUBLE_CLICK,
                this.divide_account_modal.buttons_container
            ).show();
        }

        Object.keys(this.items).forEach((index) => {
            const item = this.items[index];

            item.in_current_order = item.data.qty;
            item.in_new_order = 0;

            const item_base_name = `${this.data.name}-${item.data.entry_name}`;

            const adds = document.getElementsByClassName(`${item_base_name}-add-item`);

            Object.keys(adds).forEach((key) => {
                let add = adds[key];
                add.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    if (item.in_current_order > 0) {
                        item.in_current_order--;
                        item.in_new_order++;

                        this.set_values_in_divide_modal(
                            item_base_name,
                            {
                                "from_qty": item.in_current_order,
                                "to_qty": item.in_new_order,
                                "rate": item.data.rate,
                            }
                        );
                    }
                });
            });

            const all_minus = document.getElementsByClassName(`${item_base_name}-minus-item`);

            Object.keys(all_minus).forEach((key) => {
                const minus = all_minus[key];
                minus.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (item.in_new_order > 0) {
                        item.in_current_order++;
                        item.in_new_order--;

                        this.set_values_in_divide_modal(
                            item_base_name,
                            {
                                "from_qty": item.in_current_order,
                                "to_qty": item.in_new_order,
                                "rate": item.data.rate,
                            }
                        );
                    }
                });
            });
        });
    }

    set_values_in_divide_modal(base_name, data = {}) {
        $(`.${base_name}-from-qty`).empty().append(data.from_qty);
        $(`.${base_name}-to-qty`).empty().append(data.to_qty);

        $(`.${base_name}-from-total`).empty().append(
            RM.format_currency(parseFloat(data.from_qty) * parseFloat(data.rate))
        );
        $(`.${base_name}-to-total`).empty().append(
            RM.format_currency(parseFloat(data.to_qty) * parseFloat(data.rate))
        );

        this.aggregate_in_divide_modal();
    }

    aggregate_in_divide_modal() {
        let total_left = 0, total_right = 0;
        Object.keys(this.items).forEach((index) => {
            let item = this.items[index];

            total_left += (item.in_current_order * item.data.rate);
            total_right += (item.in_new_order * item.data.rate);

            $(`.${this.data.table}_${this.data.name}-grand-total-left`).empty().append(
                RM.format_currency(total_left)
            );

            $(`.${this.data.table}_${this.data.name}-grand-total-right`).empty().append(
                RM.format_currency(total_right)
            );
        });
    }

    _divide() {
        const update_data = {};

        if (RM.busy_message()) return;

        Object.keys(this.items).forEach((index) => {
            let item = this.items[index];

            if (item.in_new_order > 0) {
                update_data[item.data.identifier] = {
                    'name': item.data.entry_name,
                    'qty': item.in_new_order,
                    'identifier': "entry_" + RM.uuid()
                };
            }
        });

        if (Object.keys(update_data).length) {
            RM.working("Dividing Account");
            frappeHelper.api.call({
                model: "Table Order",
                name: this.data.name,
                method: "divide",
                args: { "items": update_data, client: RM.client },
                always: (r) => {
                    RM.ready();
                    if (typeof r.message != "undefined") {
                        this.divide_account_modal.hide();
                    }
                }
            });
        } else {
            frappe.msgprint(__('You have not selected products'))
        }
    }

    order() {
        if (RM.busy_message() || this.data.products_not_ordered <= 0) {
            return;
        }

        RM.working("Send order to Prepare");

        frappeHelper.api.call({
            model: "Table Order",
            name: this.data.name,
            method: "send",
            always: (r) => {
                this.order_manage.components.Order.remove_class("btn-warning");
                RM.ready(false, "success");
                this.data = r.message.order.data;
                this.render();
                this.check_items({ items: r.message.items });
            },
        });
    }

    get amount() {
        return isNaN(parseFloat(this.data.amount)) ? 0 : parseFloat(this.data.amount);
    }

    get total_money() {
        return RM.format_currency(this.amount);
    }

    validate_items(){
        let valid = false;
        Object.keys(this.items).forEach((index) => {
            const item_in_order = this.items[index];
        });

        return valid;
    }

    async pay() {
        if (RM.busy || !RM.can_pay) return;
        if (RM.pos_profile == null) {
            frappe.msgprint(RM.not_has_pos_profile_message());
        } else if (RM.pos_profile.payments.length === 0) {
            frappe.msgprint(__("There are no configured payment methods"));
        } else {
            this.validate_items();
            if (this.pay_form == null) {
                this.pay_form = new PayForm({
                    order: this,
                    //location: this.order_manage.invoice_wrapper.JQ()
                });
            } else {
                await this.pay_form.reload();
                this.pay_form.show();
            }

//this.order_manage.toggle_main_section("invoice");
        }
    }

    print_account() {
        const title = this.data.name + " (" + __("Account") + ")";
        const order_manage = this.order_manage;
        const props = {
            model: "Table Order",
            model_name: this.data.name,
            from_server: true,
            args: {
                format: "Order Account",
                _lang: RM.lang,
                no_letterhead: RM.pos_profile.letter_head ? RM.pos_profile.letter_head : 1,
                letterhead: RM.pos_profile.letter_head ? RM.pos_profile.letter_head : 'No%20Letterhead'
            },
            set_buttons: true,
            is_pdf: true,
            customize: true,
            title: title
        }

        if (order_manage.print_modal) {
            order_manage.print_modal.set_props(props);
            order_manage.print_modal.set_title(title);
            order_manage.print_modal.reload().show();
        } else {
            order_manage.print_modal = new DeskModal(props);
        }
    }

    set_customer() {
        this.edit("customer");
    }

    set_dinners() {
        this.edit("dinners");
    }

    edit(type) {
        const form = type + "_form";
        if (this[form]) {
            this[form].reload();
            this[form].show();
        } else {
            this[form] = new DeskForm({
                form_name: `restaurant-order-${type}`,
                doc_name: this.data.name,
                callback: self => {
                    self.hide();

                    RM.sound_submit();
                    this.data[type] = self.get_value(type);
                    this.make_invoice();
                },
                title: __(`Set ${type}`),
                after_load: self => {
                    const input = self.get_field(type);
                    input.set_focus();
                }
            });
        }
    }

    delete_current_item() {
        this.current_item = null;
        this.order_manage.check_buttons_status();
    }

    select_first_item() {
        this.in_items((item, k, index) => {
            if (index === 0) item.select();
        });
    }

    is_some_item(item1, item2) {
        return item1 != null && item1.data.identifier === item2.data.identifier;
    }

    delete_item(identifier) {
        const item = this.get_item(identifier);
        if (item) {
            if (this.is_some_item(this.current_item, item)) {
                this.delete_current_item();
            }
            item.remove();
            delete this.items[identifier];
        }
    }
}