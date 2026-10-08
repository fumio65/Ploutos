-- Pin search_path on trigger functions (fixes "Function Search Path Mutable" advisory)
alter function set_updated_at() set search_path = public;
alter function apply_transfer() set search_path = public;
alter function apply_transaction() set search_path = public;
alter function apply_debt_receivable_repayment() set search_path = public;
