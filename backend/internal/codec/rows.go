package codec

import (
	"encoding/json"
	"fmt"

	"github.com/az58740/club-manager/backend/internal/domain"
)

func init() {
	registry[domain.EntityClub] = projectClub
	registry[domain.EntityTeams] = projectTeam
	registry[domain.EntityPlayers] = projectPlayer
	registry[domain.EntityEvents] = projectEvent
	registry[domain.EntityAttendance] = projectAttendance
	registry[domain.EntityStats] = projectStat
	registry[domain.EntityInvoices] = projectInvoice
	registry[domain.EntityPayments] = projectPayment
	registry[domain.EntityCategories] = projectCategory
	registry[domain.EntityAccounts] = projectAccount
	registry[domain.EntityTransactions] = projectTransaction
	registry[domain.EntityProducts] = projectProduct
	registry[domain.EntityStockMovement] = projectStockMovement
}

// integer accepts the whole-number amounts the app writes and refuses anything
// else loudly: a silent NULL on a money column is how balances go missing.
func integer(value json.Number, field string) (int64, error) {
	if value.String() == "" {
		return 0, domain.Invalid("%s is required", field)
	}
	n, err := value.Int64()
	if err != nil {
		return 0, domain.Invalid("%s must be a whole number, got %s", field, value.String())
	}
	return n, nil
}

func optInteger(value json.Number, field string) (any, error) {
	if value.String() == "" {
		return nil, nil
	}
	n, err := integer(value, field)
	if err != nil {
		return nil, err
	}
	return n, nil
}

func build(table, clubID, id string, payload json.RawMessage, pairs ...any) Row {
	columns := []string{"club_id", "id", "payload"}
	values := []any{clubID, id, string(payload)}
	for i := 0; i+1 < len(pairs); i += 2 {
		columns = append(columns, pairs[i].(string))
		values = append(values, pairs[i+1])
	}
	return Row{Table: table, Columns: columns, Values: values}
}

/* ---------------------------------- club ---------------------------------- */

type clubProfile struct {
	Name      string  `json:"name"`
	ShortName string  `json:"shortName"`
	Sport     string  `json:"sport"`
	City      string  `json:"city"`
	Founded   string  `json:"founded"`
	Phone     string  `json:"phone"`
	Season    string  `json:"season"`
	Logo      *string `json:"logo"`
}

func projectClub(clubID, _ string, payload json.RawMessage) (Row, error) {
	var in clubProfile
	if err := Decode(domain.EntityClub, payload, &in); err != nil {
		return Row{}, err
	}
	if in.Name == "" {
		return Row{}, domain.Invalid("club name is required")
	}
	// The club profile row is the clubs row itself, keyed by the club id.
	return build("clubs", clubID, clubID, payload,
		"name", text(in.Name),
		"short_name", text(in.ShortName),
		"sport", text(in.Sport),
		"city", text(in.City),
		"founded", text(in.Founded),
		"phone", text(in.Phone),
		"season", text(in.Season),
		"logo", optText(in.Logo),
	), nil
}

/* ---------------------------------- teams --------------------------------- */

type teamRow struct {
	Name      string `json:"name"`
	AgeGroup  string `json:"ageGroup"`
	Coach     string `json:"coach"`
	Color     string `json:"color"`
	Season    string `json:"season"`
	HomeVenue string `json:"homeVenue"`
}

func projectTeam(clubID, id string, payload json.RawMessage) (Row, error) {
	var in teamRow
	if err := Decode(domain.EntityTeams, payload, &in); err != nil {
		return Row{}, err
	}
	if in.Name == "" {
		return Row{}, domain.Invalid("team name is required")
	}
	return build("teams", clubID, id, payload,
		"name", text(in.Name),
		"age_group", text(in.AgeGroup),
		"coach", text(in.Coach),
		"color", text(in.Color),
		"season", text(in.Season),
		"home_venue", text(in.HomeVenue),
	), nil
}

/* --------------------------------- players -------------------------------- */

type playerRow struct {
	FullName   string      `json:"fullName"`
	Phone      string      `json:"phone"`
	TeamID     string      `json:"teamId"`
	Position   string      `json:"position"`
	Jersey     json.Number `json:"jersey"`
	BirthDate  string      `json:"birthDate"`
	HeightCm   json.Number `json:"heightCm"`
	Status     string      `json:"status"`
	JoinedAt   string      `json:"joinedAt"`
	MonthlyFee json.Number `json:"monthlyFee"`
	Note       *string     `json:"note"`
	Address    *string     `json:"address"`
	Insured    *bool       `json:"insured"`
}

func projectPlayer(clubID, id string, payload json.RawMessage) (Row, error) {
	var in playerRow
	if err := Decode(domain.EntityPlayers, payload, &in); err != nil {
		return Row{}, err
	}
	if in.FullName == "" {
		return Row{}, domain.Invalid("player fullName is required")
	}
	if in.Position == "" {
		return Row{}, domain.Invalid("player position is required")
	}
	if in.Status == "" {
		return Row{}, domain.Invalid("player status is required")
	}
	jersey, err := integer(in.Jersey, "player jersey")
	if err != nil {
		return Row{}, err
	}
	height, err := optInteger(in.HeightCm, "player heightCm")
	if err != nil {
		return Row{}, err
	}
	fee, err := integer(in.MonthlyFee, "player monthlyFee")
	if err != nil {
		return Row{}, err
	}
	birth, err := date(in.BirthDate)
	if err != nil {
		return Row{}, domain.Invalid("player birthDate: %v", err)
	}
	joined, err := date(in.JoinedAt)
	if err != nil {
		return Row{}, domain.Invalid("player joinedAt: %v", err)
	}
	team, err := requiredID(in.TeamID, "player teamId")
	if err != nil {
		return Row{}, err
	}
	return build("players", clubID, id, payload,
		"full_name", text(in.FullName),
		"phone", text(in.Phone),
		"team_id", team,
		"position", text(in.Position),
		"jersey", num(jersey),
		"birth_date", birth,
		"height_cm", height,
		"status", text(in.Status),
		"joined_at", joined,
		"monthly_fee", num(fee),
		"note", optText(in.Note),
		"address", optText(in.Address),
		"insured", flag(in.Insured, false),
	), nil
}

/* --------------------------------- events --------------------------------- */

type eventRow struct {
	Type         string          `json:"type"`
	TeamID       string          `json:"teamId"`
	Title        string          `json:"title"`
	Opponent     *string         `json:"opponent"`
	Location     string          `json:"location"`
	StartsAt     string          `json:"startsAt"`
	DurationMin  json.Number     `json:"durationMin"`
	Status       string          `json:"status"`
	Notes        *string         `json:"notes"`
	ReminderNote *string         `json:"reminderNote"`
	Sets         json.RawMessage `json:"sets"`
}

func projectEvent(clubID, id string, payload json.RawMessage) (Row, error) {
	var in eventRow
	if err := Decode(domain.EntityEvents, payload, &in); err != nil {
		return Row{}, err
	}
	if in.Title == "" {
		return Row{}, domain.Invalid("event title is required")
	}
	if in.Type == "" || in.Status == "" {
		return Row{}, domain.Invalid("event type and status are required")
	}
	team, err := requiredID(in.TeamID, "event teamId")
	if err != nil {
		return Row{}, err
	}
	starts, err := datetime(in.StartsAt)
	if err != nil {
		return Row{}, domain.Invalid("event startsAt: %v", err)
	}
	minutes, err := integer(in.DurationMin, "event durationMin")
	if err != nil {
		return Row{}, err
	}
	return build("events", clubID, id, payload,
		"type", text(in.Type),
		"team_id", team,
		"title", text(in.Title),
		"opponent", optText(in.Opponent),
		"location", text(in.Location),
		"starts_at", starts,
		"duration_min", num(minutes),
		"status", text(in.Status),
		"notes", optText(in.Notes),
		"reminder_note", optText(in.ReminderNote),
		"sets", raw(in.Sets),
	), nil
}

/* ------------------------------- attendance ------------------------------- */

type attendanceRow struct {
	EventID  string `json:"eventId"`
	PlayerID string `json:"playerId"`
	Status   string `json:"status"`
}

func projectAttendance(clubID, id string, payload json.RawMessage) (Row, error) {
	var in attendanceRow
	if err := Decode(domain.EntityAttendance, payload, &in); err != nil {
		return Row{}, err
	}
	event, err := requiredID(in.EventID, "attendance eventId")
	if err != nil {
		return Row{}, err
	}
	player, err := requiredID(in.PlayerID, "attendance playerId")
	if err != nil {
		return Row{}, err
	}
	if in.Status == "" {
		return Row{}, domain.Invalid("attendance status is required")
	}
	return build("attendance", clubID, id, payload,
		"event_id", event,
		"player_id", player,
		"status", text(in.Status),
	), nil
}

/* --------------------------------- stats ---------------------------------- */

type statRow struct {
	EventID     string      `json:"eventId"`
	PlayerID    string      `json:"playerId"`
	ServePoints json.Number `json:"servePoints"`
	AttackPoint json.Number `json:"attackPoints"`
	BlockPoints json.Number `json:"blockPoints"`
	Digs        json.Number `json:"digs"`
	Errors      json.Number `json:"errors"`
}

func projectStat(clubID, id string, payload json.RawMessage) (Row, error) {
	var in statRow
	if err := Decode(domain.EntityStats, payload, &in); err != nil {
		return Row{}, err
	}
	event, err := requiredID(in.EventID, "stat eventId")
	if err != nil {
		return Row{}, err
	}
	player, err := requiredID(in.PlayerID, "stat playerId")
	if err != nil {
		return Row{}, err
	}
	nums := make([]int64, 0, 5)
	for i, value := range []json.Number{in.ServePoints, in.AttackPoint, in.BlockPoints, in.Digs, in.Errors} {
		n, err := integer(value, fmt.Sprintf("stat field %d", i))
		if err != nil {
			return Row{}, err
		}
		nums = append(nums, n)
	}
	return build("match_stats", clubID, id, payload,
		"event_id", event,
		"player_id", player,
		"serve_points", num(nums[0]),
		"attack_points", num(nums[1]),
		"block_points", num(nums[2]),
		"digs", num(nums[3]),
		"errors", num(nums[4]),
	), nil
}

/* -------------------------------- invoices -------------------------------- */

type invoiceRow struct {
	PlayerID string      `json:"playerId"`
	Kind     string      `json:"kind"`
	Period   string      `json:"period"`
	Title    string      `json:"title"`
	Amount   json.Number `json:"amount"`
	DueAt    string      `json:"dueAt"`
	IssuedAt string      `json:"issuedAt"`
}

func projectInvoice(clubID, id string, payload json.RawMessage) (Row, error) {
	var in invoiceRow
	if err := Decode(domain.EntityInvoices, payload, &in); err != nil {
		return Row{}, err
	}
	player, err := requiredID(in.PlayerID, "invoice playerId")
	if err != nil {
		return Row{}, err
	}
	if in.Kind == "" || in.Period == "" || in.Title == "" {
		return Row{}, domain.Invalid("invoice kind, period and title are required")
	}
	amount, err := integer(in.Amount, "invoice amount")
	if err != nil {
		return Row{}, err
	}
	due, err := datetime(in.DueAt)
	if err != nil {
		return Row{}, domain.Invalid("invoice dueAt: %v", err)
	}
	issued, err := datetime(in.IssuedAt)
	if err != nil {
		return Row{}, domain.Invalid("invoice issuedAt: %v", err)
	}
	return build("invoices", clubID, id, payload,
		"player_id", player,
		"kind", text(in.Kind),
		"period", text(in.Period),
		"title", text(in.Title),
		"amount", num(amount),
		"due_at", due,
		"issued_at", issued,
	), nil
}

/* -------------------------------- payments -------------------------------- */

type paymentRow struct {
	InvoiceID string      `json:"invoiceId"`
	PlayerID  string      `json:"playerId"`
	Amount    json.Number `json:"amount"`
	PaidAt    string      `json:"paidAt"`
	Method    string      `json:"method"`
	AccountID *string     `json:"accountId"`
	Reference *string     `json:"reference"`
}

func projectPayment(clubID, id string, payload json.RawMessage) (Row, error) {
	var in paymentRow
	if err := Decode(domain.EntityPayments, payload, &in); err != nil {
		return Row{}, err
	}
	invoice, err := requiredID(in.InvoiceID, "payment invoiceId")
	if err != nil {
		return Row{}, err
	}
	player, err := requiredID(in.PlayerID, "payment playerId")
	if err != nil {
		return Row{}, err
	}
	amount, err := integer(in.Amount, "payment amount")
	if err != nil {
		return Row{}, err
	}
	paid, err := datetime(in.PaidAt)
	if err != nil {
		return Row{}, domain.Invalid("payment paidAt: %v", err)
	}
	if in.Method == "" {
		return Row{}, domain.Invalid("payment method is required")
	}
	return build("payments", clubID, id, payload,
		"invoice_id", invoice,
		"player_id", player,
		"amount", num(amount),
		"paid_at", paid,
		"method", text(in.Method),
		"account_id", optText(in.AccountID),
		"reference", optText(in.Reference),
	), nil
}

/* ------------------------------- categories ------------------------------- */

type categoryRow struct {
	Name   string `json:"name"`
	Kind   string `json:"kind"`
	System *bool  `json:"system"`
}

func projectCategory(clubID, id string, payload json.RawMessage) (Row, error) {
	var in categoryRow
	if err := Decode(domain.EntityCategories, payload, &in); err != nil {
		return Row{}, err
	}
	if in.Name == "" || in.Kind == "" {
		return Row{}, domain.Invalid("category name and kind are required")
	}
	return build("finance_categories", clubID, id, payload,
		"name", text(in.Name),
		"kind", text(in.Kind),
		"system", flag(in.System, false),
	), nil
}

/* -------------------------------- accounts -------------------------------- */

type accountRow struct {
	Name           string      `json:"name"`
	Kind           string      `json:"kind"`
	BankName       *string     `json:"bankName"`
	AccountNumber  *string     `json:"accountNumber"`
	CardNumber     *string     `json:"cardNumber"`
	IBAN           *string     `json:"iban"`
	OpeningBalance json.Number `json:"openingBalance"`
	Active         bool        `json:"active"`
}

func projectAccount(clubID, id string, payload json.RawMessage) (Row, error) {
	var in accountRow
	if err := Decode(domain.EntityAccounts, payload, &in); err != nil {
		return Row{}, err
	}
	if in.Name == "" || in.Kind == "" {
		return Row{}, domain.Invalid("account name and kind are required")
	}
	opening, err := integer(in.OpeningBalance, "account openingBalance")
	if err != nil {
		return Row{}, err
	}
	return build("accounts", clubID, id, payload,
		"name", text(in.Name),
		"kind", text(in.Kind),
		"bank_name", optText(in.BankName),
		"account_number", optText(in.AccountNumber),
		"card_number", optText(in.CardNumber),
		"iban", optText(in.IBAN),
		"opening_balance", num(opening),
		"active", flag(&in.Active, true),
	), nil
}

/* ------------------------------ ledger entries ---------------------------- */

type chequeFields struct {
	Number string `json:"number"`
	Bank   string `json:"bank"`
	DueAt  string `json:"dueAt"`
	Status string `json:"status"`
}

type transactionRow struct {
	Kind       string        `json:"kind"`
	CategoryID string        `json:"categoryId"`
	AccountID  string        `json:"accountId"`
	Amount     json.Number   `json:"amount"`
	Method     string        `json:"method"`
	Date       string        `json:"date"`
	Title      string        `json:"title"`
	Party      *string       `json:"party"`
	PlayerID   *string       `json:"playerId"`
	Source     string        `json:"source"`
	RefID      *string       `json:"refId"`
	Cheque     *chequeFields `json:"cheque"`
	Note       *string       `json:"note"`
	Credit     *bool         `json:"credit"`
	Settled    *bool         `json:"settled"`
	SettledAt  *string       `json:"settledAt"`
	CreatedAt  string        `json:"createdAt"`
}

func projectTransaction(clubID, id string, payload json.RawMessage) (Row, error) {
	var in transactionRow
	if err := Decode(domain.EntityTransactions, payload, &in); err != nil {
		return Row{}, err
	}
	if in.Kind == "" || in.Method == "" || in.Source == "" {
		return Row{}, domain.Invalid("transaction kind, method and source are required")
	}
	if in.Title == "" {
		return Row{}, domain.Invalid("transaction title is required")
	}
	category, err := requiredID(in.CategoryID, "transaction categoryId")
	if err != nil {
		return Row{}, err
	}
	account, err := requiredID(in.AccountID, "transaction accountId")
	if err != nil {
		return Row{}, err
	}
	amount, err := integer(in.Amount, "transaction amount")
	if err != nil {
		return Row{}, err
	}
	day, err := date(in.Date)
	if err != nil {
		return Row{}, domain.Invalid("transaction date: %v", err)
	}
	created, err := datetime(in.CreatedAt)
	if err != nil {
		return Row{}, domain.Invalid("transaction createdAt: %v", err)
	}
	settledAt, err := optDatetime(in.SettledAt)
	if err != nil {
		return Row{}, domain.Invalid("transaction settledAt: %v", err)
	}
	var chequeDue any
	var chequeCols []any
	if in.Cheque != nil {
		chequeDue, err = datetime(in.Cheque.DueAt)
		if err != nil {
			return Row{}, domain.Invalid("transaction cheque dueAt: %v", err)
		}
		chequeCols = []any{
			"cheque_number", text(in.Cheque.Number),
			"cheque_bank", text(in.Cheque.Bank),
			"cheque_due_at", chequeDue,
			"cheque_status", text(in.Cheque.Status),
		}
	} else {
		chequeCols = []any{
			"cheque_number", nil,
			"cheque_bank", nil,
			"cheque_due_at", nil,
			"cheque_status", nil,
		}
	}
	cols := []any{
		"kind", text(in.Kind),
		"category_id", category,
		"account_id", account,
		"amount", num(amount),
		"method", text(in.Method),
		"entry_date", day,
		"title", text(in.Title),
		"party", optText(in.Party),
		"player_id", optText(in.PlayerID),
		"source", text(in.Source),
		"ref_id", optText(in.RefID),
	}
	cols = append(cols, chequeCols...)
	cols = append(cols,
		"note", optText(in.Note),
		"credit", flag(in.Credit, false),
		"settled", flag(in.Settled, false),
		"settled_at", settledAt,
		"recorded_at", created,
	)
	return build("ledger_entries", clubID, id, payload, cols...), nil
}

/* -------------------------------- products -------------------------------- */

type productRow struct {
	Name      string      `json:"name"`
	Category  string      `json:"category"`
	SKU       *string     `json:"sku"`
	Size      *string     `json:"size"`
	CostPrice json.Number `json:"costPrice"`
	SalePrice json.Number `json:"salePrice"`
	Stock     json.Number `json:"stock"`
	MinStock  json.Number `json:"minStock"`
	Active    bool        `json:"active"`
}

func projectProduct(clubID, id string, payload json.RawMessage) (Row, error) {
	var in productRow
	if err := Decode(domain.EntityProducts, payload, &in); err != nil {
		return Row{}, err
	}
	if in.Name == "" || in.Category == "" {
		return Row{}, domain.Invalid("product name and category are required")
	}
	nums := make([]int64, 0, 4)
	for _, pair := range []struct {
		name  string
		value json.Number
	}{{"costPrice", in.CostPrice}, {"salePrice", in.SalePrice}, {"stock", in.Stock}, {"minStock", in.MinStock}} {
		n, err := integer(pair.value, "product "+pair.name)
		if err != nil {
			return Row{}, err
		}
		nums = append(nums, n)
	}
	return build("products", clubID, id, payload,
		"name", text(in.Name),
		"category", text(in.Category),
		"sku", optText(in.SKU),
		"size", optText(in.Size),
		"cost_price", num(nums[0]),
		"sale_price", num(nums[1]),
		"stock", num(nums[2]),
		"min_stock", num(nums[3]),
		"active", flag(&in.Active, true),
	), nil
}

/* ----------------------------- stock movements ---------------------------- */

type stockMovementRow struct {
	ProductID string        `json:"productId"`
	Kind      string        `json:"kind"`
	Qty       json.Number   `json:"qty"`
	UnitPrice json.Number   `json:"unitPrice"`
	Date      string        `json:"date"`
	Party     *string       `json:"party"`
	AccountID *string       `json:"accountId"`
	Method    *string       `json:"method"`
	Cheque    *chequeFields `json:"cheque"`
	LedgerID  *string       `json:"ledgerId"`
	Note      *string       `json:"note"`
}

func projectStockMovement(clubID, id string, payload json.RawMessage) (Row, error) {
	var in stockMovementRow
	if err := Decode(domain.EntityStockMovement, payload, &in); err != nil {
		return Row{}, err
	}
	product, err := requiredID(in.ProductID, "stockMovement productId")
	if err != nil {
		return Row{}, err
	}
	if in.Kind == "" {
		return Row{}, domain.Invalid("stockMovement kind is required")
	}
	qty, err := integer(in.Qty, "stockMovement qty")
	if err != nil {
		return Row{}, err
	}
	price, err := integer(in.UnitPrice, "stockMovement unitPrice")
	if err != nil {
		return Row{}, err
	}
	day, err := date(in.Date)
	if err != nil {
		return Row{}, domain.Invalid("stockMovement date: %v", err)
	}
	var chequeDue any
	if in.Cheque != nil {
		chequeDue, err = datetime(in.Cheque.DueAt)
		if err != nil {
			return Row{}, domain.Invalid("stockMovement cheque dueAt: %v", err)
		}
	}
	return build("stock_movements", clubID, id, payload,
		"product_id", product,
		"kind", text(in.Kind),
		"qty", num(qty),
		"unit_price", num(price),
		"entry_date", day,
		"party", optText(in.Party),
		"account_id", optText(in.AccountID),
		"method", optText(in.Method),
		"cheque_number", optChequeText(in.Cheque, func(c *chequeFields) string { return c.Number }),
		"cheque_bank", optChequeText(in.Cheque, func(c *chequeFields) string { return c.Bank }),
		"cheque_due_at", chequeDue,
		"cheque_status", optChequeText(in.Cheque, func(c *chequeFields) string { return c.Status }),
		"ledger_id", optText(in.LedgerID),
		"note", optText(in.Note),
	), nil
}

func optChequeText(cheque *chequeFields, pick func(*chequeFields) string) any {
	if cheque == nil {
		return nil
	}
	return pick(cheque)
}
