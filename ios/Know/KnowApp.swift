import SwiftUI
import Combine
import Foundation
import Security

struct Path: Codable, Identifiable { let id: UUID; let name: String; let description: String?; let status: String }
struct Item: Codable, Identifiable { let id: UUID; let title: String; let type: String; let description: String?; let status: String; let progress: Int; let pathIds: [UUID]; let tags: [String] }
struct Note: Codable, Identifiable { let id: UUID; let pathId: UUID?; let itemId: UUID?; let activityId: UUID?; let title: String; let content: String }
struct Activity: Codable, Identifiable { let id: UUID; let type: String; let title: String; let detail: String?; let occurredAt: String }
struct TimerState: Codable, Identifiable { let id: UUID; let pathId: UUID?; let itemId: UUID?; let startedAt: String; let endedAt: String?; let description: String?; let running: Bool }
struct TimerRequest: Codable { let pathId: String?; let itemId: String?; let description: String; let source: String }
struct PathRequest: Codable { let name: String; let description: String? }
struct ItemRequest: Codable { let title: String; let type: String; let description: String?; let status: String?; let pathIds: [UUID]; let tags: [String] }
struct Statistics: Codable { let todaySeconds: Int64; let weekSeconds: Int64; let monthSeconds: Int64; let todayByPath: [String:Int64]; let todayByItem: [String:Int64]; let completedItems: Int64; let activeItems: Int64; let recentProgressChanges: [ProgressChange] }
struct ProgressChange: Codable { let itemId: UUID; let previousProgress: Int; let newProgress: Int; let changedAt: String }
struct AuthResponse: Codable { let token: String; let userId: UUID; let email: String; let displayName: String }

func itemsForTimerPath(_ path: UUID?, from items: [Item]) -> [Item] {
    guard let path else { return items }
    return items.filter { $0.pathIds.contains(path) }
}

func isUITesting(arguments: [String] = ProcessInfo.processInfo.arguments) -> Bool {
    arguments.contains("-ui-testing")
}

enum KeychainTokenStore {
    private static let service = "com.know.ios"; private static let account = "session"
    static func read() -> String? { var query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:account,kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne];var result:CFTypeRef?;guard SecItemCopyMatching(query as CFDictionary,&result)==errSecSuccess,let data=result as? Data else{return nil};return String(data:data,encoding:.utf8) }
    static func save(_ token:String){delete();let data=Data(token.utf8);let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:account,kSecValueData as String:data,kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlock];SecItemAdd(query as CFDictionary,nil)}
    static func delete(){let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:account];SecItemDelete(query as CFDictionary)}
}

enum APIError: Error { case unauthorized; case offline }
struct APIClient {
    let base: URL
    let session: URLSession
    init(base: URL? = nil, session: URLSession = .shared){self.base=base ?? URL(string:ProcessInfo.processInfo.environment["KNOW_API_URL"] ?? "http://localhost:8080/api/v1")!;self.session=session}
    private func makeRequest(_ path:String,method:String,body:Data?,token:String?) -> URLRequest { var request=URLRequest(url:base.appendingPathComponent(path));request.httpMethod=method;request.httpBody=body;request.setValue("application/json",forHTTPHeaderField:"Content-Type");if let token{request.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization")};return request }
    private func send(_ request:URLRequest) async throws -> Data {
        let attempts = request.httpMethod == "GET" || request.httpMethod == "HEAD" ? 2 : 1
        for attempt in 0..<attempts {
            do {
                let (data,response)=try await session.data(for:request)
                guard let http=response as? HTTPURLResponse else{throw URLError(.badServerResponse)}
                if http.statusCode==401{throw APIError.unauthorized}
                guard 200..<300 ~= http.statusCode else{throw URLError(.badServerResponse)}
                return data
            } catch let error as APIError { throw error }
              catch let error as URLError where Self.isTransient(error) {
                if attempt + 1 < attempts { continue }
                throw APIError.offline
            }
        }
        throw APIError.offline
    }
    private static func isTransient(_ error:URLError) -> Bool { [.notConnectedToInternet,.networkConnectionLost,.timedOut,.cannotConnectToHost,.cannotFindHost].contains(error.code) }
    func request<T:Decodable>(_ path:String,method:String="GET",body:Data?=nil,token:String?=nil) async throws -> T { let data=try await send(makeRequest(path,method:method,body:body,token:token));return try JSONDecoder().decode(T.self,from:data) }
    func optional<T:Decodable>(_ path:String,method:String="GET",body:Data?=nil,token:String?=nil) async throws -> T? { let data=try await send(makeRequest(path,method:method,body:body,token:token));return data.isEmpty ? nil : try JSONDecoder().decode(T.self,from:data) }
    func empty(_ path:String,method:String,token:String) async throws { _=try await send(makeRequest(path,method:method,body:Data("{}".utf8),token:token)) }
}

@MainActor final class AppModel:ObservableObject {
    @Published var token=KeychainTokenStore.read();@Published var paths:[Path]=[];@Published var items:[Item]=[];@Published var notes:[Note]=[];@Published var activities:[Activity]=[];@Published var timer:TimerState?;@Published var stats:Statistics?;@Published var error:String?;@Published var isLoading=false
    let api:APIClient
    init(api:APIClient=APIClient()){self.api=api;if isUITesting(){token=nil}}
    var signedIn:Bool{token != nil}
    func handle(_ failure:Error,_ message:String){if let failure=failure as? APIError { switch failure { case .unauthorized: signOut(); case .offline: error="No network connection. Reconnect and try again." } } else {error=message}}
    func authenticate(email:String,password:String,register:Bool) async {do{let body=try JSONEncoder().encode(["email":email,"password":password]);let result:AuthResponse=try await api.request(register ? "/auth/register":"/auth/login",method:"POST",body:body);token=result.token;KeychainTokenStore.save(result.token);await refresh()}catch{handle(error,"Authentication failed. Check your credentials.")}}
    func refresh() async {guard let token else{return};isLoading=true;defer{isLoading=false};do{async let p:[Path]=api.request("/paths",token:token);async let i:[Item]=api.request("/items",token:token);async let n:[Note]=api.request("/notes",token:token);async let a:[Activity]=api.request("/activities",token:token);async let s:Statistics=api.request("/statistics",token:token);paths=try await p;items=try await i;notes=try await n;activities=try await a;stats=try await s;timer=try await api.optional("/timers/current",token:token)}catch{handle(error,"Could not refresh your workspace.")}}
    func toggleTimer(pathId:UUID?=nil,itemId:UUID?=nil) async {guard let token else{return};do{if timer != nil{try await api.empty("/timers/stop",method:"POST",token:token);timer=nil}else{let data=try JSONEncoder().encode(TimerRequest(pathId:pathId?.uuidString,itemId:itemId?.uuidString,description:"iOS session",source:"IOS"));timer=try await api.request("/timers",method:"POST",body:data,token:token)}}catch{handle(error,"Could not update the timer.")}}
    func cancelTimer() async {guard let token else{return};do{try await api.empty("/timers/cancel",method:"POST",token:token);timer=nil}catch{handle(error,"Could not cancel the timer.")}}
    func updateProgress(itemId:UUID,value:Int) async {guard let token else{return};do{let body=try JSONEncoder().encode(["progress":max(0,min(100,value))]);let _:Item=try await api.request("/items/\(itemId)/progress",method:"POST",body:body,token:token);await refresh()}catch{handle(error,"Could not update progress.")}}
    func createNote(itemId:UUID,title:String,content:String) async {guard let token else{return};do{let body=try JSONEncoder().encode(["itemId":itemId.uuidString,"title":title,"content":content]);let _:Note=try await api.request("/notes",method:"POST",body:body,token:token);await refresh()}catch{handle(error,"Could not save the note.")}}
    func createPath(name:String,description:String) async {guard let token else{return};do{let body=try JSONEncoder().encode(PathRequest(name:name,description:description.isEmpty ? nil : description));let _:Path=try await api.request("/paths",method:"POST",body:body,token:token);await refresh()}catch{handle(error,"Could not create the path.")}}
    func createItem(title:String,type:String,description:String,pathIds:[UUID]) async {guard let token else{return};do{let body=try JSONEncoder().encode(ItemRequest(title:title,type:type,description:description.isEmpty ? nil : description,status:nil,pathIds:pathIds,tags:[]));let _:Item=try await api.request("/items",method:"POST",body:body,token:token);await refresh()}catch{handle(error,"Could not create the item.")}}
    func signOut(){token=nil;KeychainTokenStore.delete();paths=[];items=[];notes=[];activities=[];timer=nil;stats=nil}
}

func formatSeconds(_ value:Int64)->String { let hours=value/3600; let minutes=(value%3600)/60; return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m" }

@main
struct KnowApp: App {
    @StateObject private var model = AppModel()
    var body: some Scene { WindowGroup { RootView().environmentObject(model) } }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        Group { if model.signedIn { MainView() } else { LoginView() } }
            .alert("Know", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) { Button("OK") {} } message: { Text(model.error ?? "") }
    }
}

struct LoginView: View {
    @EnvironmentObject var model: AppModel
    @State private var email = ""
    @State private var password = ""
    @State private var register = false
    var body: some View {
        Form {
            Section { Text("know.").font(.largeTitle.bold()).foregroundStyle(.green); Text(register ? "Create your private workspace" : "Welcome back").font(.title3) }
            Section {
                TextField("Email", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress).accessibilityIdentifier("auth.email")
                SecureField("Password", text: $password).accessibilityIdentifier("auth.password")
                Button(register ? "Create account" : "Sign in") { Task { await model.authenticate(email: email, password: password, register: register) } }.accessibilityIdentifier("auth.submit")
            }
            Section { Button(register ? "Already have an account? Sign in" : "New here? Create an account") { register.toggle() } }
        }.padding(.top, 40)
    }
}

struct MainView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        TabView {
            DashboardView().accessibilityIdentifier("tab.today").tabItem { Label("Today", systemImage: "sparkles") }
            PathsView().accessibilityIdentifier("tab.paths").tabItem { Label("Paths", systemImage: "point.3.connected.trianglepath.dotted") }
            ItemsView().accessibilityIdentifier("tab.items").tabItem { Label("Items", systemImage: "books.vertical") }
            TimelineView().accessibilityIdentifier("tab.timeline").tabItem { Label("Timeline", systemImage: "clock.arrow.circlepath") }
        }.task { await model.refresh() }
    }
}
struct DashboardView: View {
    @EnvironmentObject var model: AppModel
    @State private var selectedPath = ""
    @State private var selectedItem = ""
    private var timerItems: [Item] {
        itemsForTimerPath(UUID(uuidString: selectedPath), from: model.items)
    }
    var body: some View {
        NavigationStack {
            List {
                if model.isLoading { ProgressView("Loading workspace...") }
                if let stats = model.stats {
                    Section("Tracked time") {
                        LabeledContent("Today", value: formatSeconds(stats.todaySeconds))
                        LabeledContent("This week", value: formatSeconds(stats.weekSeconds))
                        LabeledContent("This month", value: formatSeconds(stats.monthSeconds))
                        LabeledContent("Completed items", value: "\(stats.completedItems)")
                    }
                }
                Section("Focus today") {
                    Text(model.timer == nil ? "No active timer" : "Timer running").foregroundStyle(.secondary)
                    if model.timer == nil {
                        Picker("Path", selection: $selectedPath) {
                            Text("No path").tag("")
                            ForEach(model.paths.filter { $0.status == "ACTIVE" }) { path in Text(path.name).tag(path.id.uuidString) }
                        }.accessibilityIdentifier("timer.path")
                        Picker("Item", selection: $selectedItem) {
                            Text("No item").tag("")
                            ForEach(timerItems) { item in Text(item.title).tag(item.id.uuidString) }
                        }.accessibilityIdentifier("timer.item")
                            .onChange(of: selectedPath) { _, _ in
                                if !timerItems.contains(where: { $0.id.uuidString == selectedItem }) { selectedItem = "" }
                            }
                    }
                    Button(model.timer == nil ? "Start a session" : "Stop session") { Task { await model.toggleTimer(pathId: UUID(uuidString: selectedPath), itemId: UUID(uuidString: selectedItem)) } }.accessibilityIdentifier("timer.toggle")
                    if model.timer != nil { Button("Cancel", role: .destructive) { Task { await model.cancelTimer() } } }
                }
                Section("Your paths") {
                    if model.paths.isEmpty && !model.isLoading { ContentUnavailableView("No paths yet", "Create a path to organize your learning.") }
                    ForEach(model.paths) { path in
                        VStack(alignment: .leading) { Text(path.name).font(.headline); Text(path.status.capitalized).font(.caption).foregroundStyle(.secondary) }
                    }
                }
            }
            .navigationTitle("know.")
            .refreshable { await model.refresh() }
            .toolbar { Button("Sign out") { model.signOut() } }
        }
    }
}
struct PathsView: View {
    @EnvironmentObject var model: AppModel
    @State private var adding = false
    @State private var name = ""
    @State private var description = ""
    var body: some View {
        NavigationStack {
            List {
                if model.paths.isEmpty && !model.isLoading { ContentUnavailableView("No paths yet", "Create a path to organize your learning.") }
                ForEach(model.paths) { path in
                    VStack(alignment: .leading) { Text(path.name).font(.headline); if let description = path.description { Text(description).font(.subheadline).foregroundStyle(.secondary) } }
                }
            }
            .navigationTitle("Paths")
            .toolbar { Button("Add path") { adding = true }.accessibilityIdentifier("paths.add") }
            .sheet(isPresented: $adding) {
                NavigationStack {
                    Form { TextField("Name", text: $name).accessibilityIdentifier("paths.name"); TextEditor(text: $description).frame(minHeight: 100).accessibilityIdentifier("paths.description") }
                        .navigationTitle("New path")
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { adding = false } }
                            ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { await model.createPath(name: name, description: description); name = ""; description = ""; adding = false } }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityIdentifier("paths.save") }
                        }
                }
            }
        }
    }
}

struct ItemsView: View {
    @EnvironmentObject var model: AppModel
    @State private var adding = false
    @State private var title = ""
    @State private var type = "CUSTOM"
    @State private var description = ""
    @State private var selectedPaths = Set<UUID>()
    var body: some View {
        NavigationStack {
            List {
                if model.items.isEmpty && !model.isLoading { ContentUnavailableView("No items yet", "Add a resource to start tracking progress.") }
                ForEach(model.items) { item in
                    NavigationLink { ItemDetailView(item: item) } label: {
                        HStack { VStack(alignment: .leading) { Text(item.title).font(.headline); Text(item.type).font(.caption).foregroundStyle(.secondary) }; Spacer(); Text("\(item.progress)%").foregroundStyle(.secondary) }
                    }
                }
            }
            .navigationTitle("Items")
            .toolbar { Button("Add item") { adding = true }.accessibilityIdentifier("items.add") }
            .sheet(isPresented: $adding) {
                NavigationStack {
                    Form {
                        TextField("Title", text: $title).accessibilityIdentifier("items.title")
                        Picker("Type", selection: $type) { Text("Custom").tag("CUSTOM"); Text("Book").tag("BOOK"); Text("Course").tag("COURSE"); Text("Project").tag("PROJECT"); Text("Article").tag("ARTICLE"); Text("Video").tag("VIDEO") }.accessibilityIdentifier("items.type")
                        Section("Active paths") {
                            ForEach(model.paths.filter { $0.status == "ACTIVE" }) { path in
                                Toggle(path.name, isOn: Binding(get: { selectedPaths.contains(path.id) }, set: { isSelected in if isSelected { selectedPaths.insert(path.id) } else { selectedPaths.remove(path.id) } }))
                            }
                        }
                        TextEditor(text: $description).frame(minHeight: 100).accessibilityIdentifier("items.description")
                    }
                    .navigationTitle("New item")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { adding = false } }
                        ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { await model.createItem(title: title, type: type, description: description, pathIds: Array(selectedPaths)); title = ""; description = ""; type = "CUSTOM"; selectedPaths.removeAll(); adding = false } }.disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityIdentifier("items.save") }
                    }
                }
            }
        }
    }
}
struct ItemDetailView: View {
    @EnvironmentObject var model: AppModel
    let item: Item
    @State private var noteTitle = ""
    @State private var noteContent = ""
    @State private var addingNote = false
    var current: Item { model.items.first(where: { $0.id == item.id }) ?? item }
    var otherTimerRunning: Bool { model.timer != nil && model.timer?.itemId != item.id }
    var body: some View {
        List {
            Section("Progress") {
                HStack {
                    Text("\(current.progress)%"); Spacer()
                    Button("−") { Task { await model.updateProgress(itemId: item.id, value: current.progress - 5) } }
                    Button("+") { Task { await model.updateProgress(itemId: item.id, value: current.progress + 5) } }
                }.buttonStyle(.bordered)
                ProgressView(value: Double(current.progress), total: 100)
                if otherTimerRunning { Text("Another item is being tracked").font(.caption).foregroundStyle(.secondary) }
                else { Button(model.timer?.itemId == item.id ? "Stop tracking" : "Track this item") { Task { await model.toggleTimer(itemId: item.id) } }.accessibilityIdentifier("item.timer.toggle") }
            }
            Section("Notes") {
                ForEach(model.notes.filter { $0.itemId == item.id }) { note in VStack(alignment: .leading) { Text(note.title).font(.headline); Text(note.content).font(.subheadline) } }
                Button("Add note") { addingNote = true }
            }
        }
        .navigationTitle(item.title)
        .sheet(isPresented: $addingNote) {
            NavigationStack {
                Form { TextField("Title", text: $noteTitle).accessibilityIdentifier("item.note.title"); TextEditor(text: $noteContent).frame(minHeight: 140).accessibilityIdentifier("item.note.content") }
                    .navigationTitle("New note")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { addingNote = false } }
                        ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { await model.createNote(itemId: item.id, title: noteTitle, content: noteContent); noteTitle = ""; noteContent = ""; addingNote = false } }.disabled(noteTitle.isEmpty || noteContent.isEmpty).accessibilityIdentifier("item.note.save") }
                    }
            }
        }
        .task { await model.refresh() }
    }
}

struct TimelineView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        NavigationStack {
            List {
                if model.activities.isEmpty && !model.isLoading { ContentUnavailableView("No activity yet", "Your learning history will appear here.") }
                ForEach(model.activities) { activity in
                    VStack(alignment: .leading) { Text(activity.title).font(.headline); Text(activity.type.replacingOccurrences(of: "_", with: " ")).font(.caption).foregroundStyle(.secondary); if let detail = activity.detail { Text(detail).font(.subheadline) } }
                }
            }.navigationTitle("Timeline")
        }
    }
}
