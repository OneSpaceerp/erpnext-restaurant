
from __future__ import unicode_literals
import frappe
from erpnext.accounts.doctype.pos_profile.pos_profile import get_item_groups
from erpnext.accounts.doctype.pos_invoice.pos_invoice import get_stock_availability

class RestaurantManage:
    @staticmethod
    def production_center_notify(status):
        object_in_status = frappe.get_all("Status Managed Production Center", "parent", filters={
            "parentType": "Restaurant Object",
            "status_managed": ("in", status)
        })

        for item in object_in_status:
            obj = frappe.get_doc("Restaurant Object", item.parent)
            obj.synchronize()

    @staticmethod
    def get_rooms():
        user_perm = frappe.permissions.get_doc_permissions(
            frappe.new_doc("Restaurant Object"))

        if frappe.session.user == "Administrator" or user_perm.get("write") or user_perm.get("create"):
            rooms = frappe.get_all("Restaurant Object", "name, description", {
                "type": "Room",
            })
        else:
            restaurant_settings = frappe.get_single("Restaurant Settings")
            rooms_enabled = restaurant_settings.rooms_access()

            rooms = frappe.get_all("Restaurant Object", "name, description", {
                "type": "Room",
                "name": ("in", rooms_enabled)
            })

        for room in rooms:
            t = frappe.get_doc("Restaurant Object", room.name)
            room["orders_count"] = t.orders_count

        return rooms

    @staticmethod
    def set_settings_data(doc, method=None):
        # Update settings data based on POS Profile changes.
        # Adapted for compatibility with ERPNext v15.
        item_groups = get_item_groups(doc)
        stock_availability = get_stock_availability(doc)

        # Ensure that the new APIs return valid data for ERPNext v15
        if item_groups and stock_availability:
            doc.item_groups = item_groups
            doc.stock_availability = stock_availability
        frappe.db.commit()
