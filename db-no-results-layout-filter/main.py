# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "looker-sdk",
# ]
# ///
import argparse
import json

import looker_sdk


def main():
    parser = argparse.ArgumentParser(description="db-no-results-layout-filter")
    parser.add_argument("looker_user_id", type=str, help="The Looker User ID whose personal space to target")
    parser.add_argument("dashboard_template_id", type=str, help="The template dashboard ID to copy")
    args = parser.parse_args()

    looker_user_id = args.looker_user_id
    dashboard_template_id = args.dashboard_template_id

    sdk = looker_sdk.init40()

    # =========================================================================
    # Step 1: Resolve Target User's Personal Workspace
    # ======P===================================================================
    # We query the User API to discover the unique personal folder ID for the
    # target user. This acts as our target directory where the copied dashboard
    # will reside. We fall back to home_folder_id if personal_folder_id is missing.
    try:
        user = sdk.user(user_id=looker_user_id, fields="personal_folder_id,home_folder_id")
        personal_folder_id = user.personal_folder_id or user.home_folder_id
        if not personal_folder_id:
            raise ValueError(f"Could not find a personal or home folder for user ID {looker_user_id}")
        print(
            f"Found user's ({looker_user_id}) personal folder: Folder ID {personal_folder_id}"
        )
    except Exception as e:
        print(f"Error retrieving user: {e}")
        return

    # =========================================================================
    # Step 2: Retrieve Template Details
    # =========================================================================
    # We read the metadata of the template dashboard to determine its official
    # title. This title is used to search for and prune duplicates in the user's folder.
    try:
        template_dash = sdk.dashboard(dashboard_id=dashboard_template_id, fields="title")
        template_title = template_dash.title or "Untitled Template"
        print(
            f"Template dashboard title: '{template_title}' (ID: {dashboard_template_id})"
        )
    except Exception as e:
        print(f"Error retrieving template dashboard (ID: {dashboard_template_id}): {e}")
        return

    # =========================================================================
    # Step 3: Idempotency & Duplicate Elimination
    # =========================================================================
    # To prevent cluttering the user's space on repeat runs, we search the
    # user's personal folder for any existing dashboard sharing the exact same
    # title. If found, we delete it before creating the fresh copy.
    try:
        existing_dashboards = sdk.search_dashboards(folder_id=personal_folder_id, title=template_title)
        for dash in existing_dashboards:
            print(f"Found existing dashboard '{dash.title}' (ID: {dash.id}) in personal space. Deleting...")
            sdk.delete_dashboard(dashboard_id=str(dash.id))
            print(f"Successfully deleted dashboard ID {dash.id}")
    except Exception as e:
        print(f"Warning/Error searching or deleting existing dashboards: {e}")

    # =========================================================================
    # Step 4: Clone Template and Assign Ownership
    # =========================================================================
    # We clone the template dashboard directly into the user's personal folder.
    # Once cloned, we update its ownership via the user_id property so that the
    # target user possesses full owner rights over the copied instance.
    print(f"Copying template dashboard ID {dashboard_template_id} into personal folder {personal_folder_id}...")
    try:
        new_dash = sdk.copy_dashboard(dashboard_id=dashboard_template_id, folder_id=personal_folder_id)
        new_dash_id = str(new_dash.id)
        print(f"Successfully copied to new dashboard ID: {new_dash_id}")

        sdk.update_dashboard(dashboard_id=new_dash_id, body={"user_id": looker_user_id})
        print(f"Assigned ownership of dashboard {new_dash_id} to user ID {looker_user_id}")
    except Exception as e:
        print(f"Error copying dashboard: {e}")
        return

    # =========================================================================
    # Step 5: User Impersonation & Empty Tile Discovery
    # =========================================================================
    # To determine which dashboard elements have no results under the user's
    # specific permissions, we sudo as the user, clone the queries of all elements,
    # execute them, and identify elements returning zero rows.
    print(f"Impersonating user ID {looker_user_id} to check for empty tiles...")
    no_results_element_ids = []
    try:
        sdk.auth.login_user(sudo_id=int(looker_user_id))
        try:
            elements_dash = sdk.dashboard(dashboard_id=dashboard_template_id, fields="dashboard_elements")
            elements = elements_dash.dashboard_elements or []
            print(f"Found {len(elements)} dashboard elements to check.")

            for i, element in enumerate(elements):
                if not element.result_maker or not element.result_maker.query:
                    continue

                query = element.result_maker.query

                query_payload = {
                    "model": query.model,
                    "view": query.view,
                    "fields": list(query.fields) if query.fields else None,
                    "pivots": list(query.pivots) if query.pivots else None,
                    "fill_fields": list(query.fill_fields) if query.fill_fields else None,
                    "filters": dict(query.filters) if query.filters else None,
                    "filter_expression": query.filter_expression,
                    "sorts": list(query.sorts) if query.sorts else None,
                    "limit": query.limit,
                    "column_limit": query.column_limit,
                    "total": query.total,
                    "row_total": query.row_total,
                    "subtotals": list(query.subtotals) if query.subtotals else None,
                    "vis_config": dict(query.vis_config) if query.vis_config else None,
                    "dynamic_fields": query.dynamic_fields,
                    "query_timezone": query.query_timezone,
                }
                cleaned_payload = {k: v for k, v in query_payload.items() if v is not None}

                new_query = sdk.create_query(body=cleaned_payload)
                result = sdk.run_query(query_id=str(new_query.id), result_format="json")
                
                rows = json.loads(result)
                row_count = len(rows) if isinstance(rows, list) else 0
                print(f"    -> Got {row_count} rows.")
                if row_count == 0:
                    no_results_element_ids.append(str(element.id))
        finally:
            sdk.auth.logout()
            print("Impersonation finished. Logged out.")
    except Exception as e:
        print(f"Error during impersonation and query execution: {e}")

    print(f"No results element IDs from template: {no_results_element_ids}")
    no_results_set = set(no_results_element_ids)

    # =========================================================================
    # Step 6: Component Grid Layout Mapping & Realignment
    # =========================================================================
    # We read the original layout components from the template and match them with
    # the cloned dashboard's layout elements. Elements flagged with no results
    # are set to hidden/deleted, while active tiles are passed to the packing algorithm.
    print(f"Applying layout adjustments on the cloned dashboard ID '{new_dash_id}'...")
    try:
        template_dashboard = sdk.dashboard(
            dashboard_id=dashboard_template_id,
            fields="dashboard_elements,dashboard_layouts"
        )
        cloned_dashboard = sdk.dashboard(
            dashboard_id=new_dash_id,
            fields="dashboard_elements,dashboard_layouts"
        )

        cloned_to_template_map = map_cloned_to_template_elements(template_dashboard, cloned_dashboard)

        template_layouts = template_dashboard.dashboard_layouts or []
        cloned_layouts = cloned_dashboard.dashboard_layouts or []

        for idx, cloned_layout in enumerate(cloned_layouts):
            if idx >= len(template_layouts):
                break
            template_layout = template_layouts[idx]

            cloned_components = cloned_layout.dashboard_layout_components or []
            t_comp_map = build_template_component_map(template_layout)

            active_pairs, inactive_pairs = partition_active_and_inactive_tiles(
                cloned_components, t_comp_map, cloned_to_template_map, no_results_set
            )

            placed_placements = run_packing_algorithm(active_pairs)

            # Position active elements
            for cc, final_row, final_col, w, h, t_elem_id in placed_placements:
                print(f"  [Dashboard '{new_dash_id}'] Placing active tile '{cc.id}' (Template ID: '{t_elem_id}') at row={final_row}, col={final_col}, w={w}, h={h}")
                sdk.update_dashboard_layout_component(
                    dashboard_layout_component_id=str(cc.id),
                    body={
                        "row": final_row,
                        "column": final_col,
                        "width": w,
                        "height": h,
                        "deleted": False
                    }
                )

            # Hide inactive/empty elements
            for cc, tc, t_elem_id in inactive_pairs:
                print(f"  [Dashboard '{new_dash_id}'] Hiding empty tile '{cc.id}' (Template ID: '{t_elem_id}')")
                sdk.update_dashboard_layout_component(
                    dashboard_layout_component_id=str(cc.id),
                    body={"deleted": True}
                )

        print(f"Layout adjustments for dashboard '{new_dash_id}' completed successfully!")

    except Exception as e:
        print(f"Error applying layouts: {e}")


# =============================================================================
# Core Layout Readjustment & Packing Engine
# =============================================================================
def run_packing_algorithm(active_pairs):
    """
    Runs a greedy 24-column grid realignment and packing algorithm.
    
    Rules followed:
      1. Elements are sorted and placed based on original template row/column.
      2. A tile with a strictly higher original row is never placed above a tile 
         with a lower original row (preserves vertical structure).
      3. Individual tile dimensions (width and height) are strictly preserved.
      4. Tiles are packed sequentially to fit within the 24-column grid boundaries 
         without overlapping any previously placed tiles.
    """
    # Sort active pairs top-to-bottom, then left-to-right based on template layout
    active_pairs.sort(key=lambda x: (x[1].row if x[1].row is not None else 0, x[1].column if x[1].column is not None else 0))

    placed_tiles = []
    placements = []

    for cc, tc, t_elem_id in active_pairs:
        w = tc.width if tc.width is not None else 8
        h = tc.height if tc.height is not None else 4
        orig_row = tc.row if tc.row is not None else 0

        # Constraint 1: Find minimum final row boundary to preserve original vertical order
        min_r = 0
        for placed in placed_tiles:
            p_orig_row, p_final_row, p_final_col, p_w, p_h = placed
            if p_orig_row < orig_row:
                if p_final_row > min_r:
                    min_r = p_final_row

        # Constraint 2: Scan rows/columns to find the first free slot that fits the tile dimensions
        found = False
        r = min_r
        while not found:
            for c in range(24 - w + 1):
                overlap = False
                for placed in placed_tiles:
                    p_orig_row, p_final_row, p_final_col, p_w, p_h = placed
                    # Overlap detection (rectangle intersection check)
                    if not (c + w <= p_final_col or p_final_col + p_w <= c or r + h <= p_final_row or p_final_row + p_h <= r):
                        overlap = True
                        break
                if not overlap:
                    final_row = r
                    final_col = c
                    found = True
                    break
            if not found:
                r += 1

        placed_tiles.append((orig_row, final_row, final_col, w, h))
        placements.append((cc, final_row, final_col, w, h, t_elem_id))


# =============================================================================
# Cloned-to-Template Dashboard Element Mapper
# =============================================================================
def map_cloned_to_template_elements(template_dashboard, cloned_dashboard):
    """
    Maps cloned dashboard element IDs to their corresponding template element IDs.
    """
    template_elements = template_dashboard.dashboard_elements or []
    cloned_elements = cloned_dashboard.dashboard_elements or []

    cloned_to_template_map = {}
    for t_elem, c_elem in zip(template_elements, cloned_elements):
        cloned_to_template_map[str(c_elem.id)] = str(t_elem.id)

    return cloned_to_template_map


# =============================================================================
# Tile Component Partition Engine
# =============================================================================
def partition_active_and_inactive_tiles(cloned_components, t_comp_map, cloned_to_template_map, no_results_set):
    """
    Partitions dashboard layout components into active and inactive pairs.
    """
    active_pairs = []
    inactive_pairs = []
    for cc in cloned_components:
        c_elem_id = str(cc.dashboard_element_id) if cc.dashboard_element_id else None
        if not c_elem_id:
            continue
        t_elem_id = cloned_to_template_map.get(c_elem_id)
        if not t_elem_id:
            continue
        tc = t_comp_map.get(t_elem_id)
        if tc:
            if t_elem_id in no_results_set or tc.deleted:
                inactive_pairs.append((cc, tc, t_elem_id))
            else:
                active_pairs.append((cc, tc, t_elem_id))

    return active_pairs, inactive_pairs


# =============================================================================
# Template Component Map Builder
# =============================================================================
def build_template_component_map(template_layout):
    """
    Builds a map of template element IDs to their corresponding layout components.
    """
    template_components = template_layout.dashboard_layout_components or []
    t_comp_map = {}
    for tc in template_components:
        if tc.dashboard_element_id:
            t_comp_map[str(tc.dashboard_element_id)] = tc
    return t_comp_map


if __name__ == "__main__":
    main()
