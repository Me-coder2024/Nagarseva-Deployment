import os
from dotenv import load_dotenv
from langchain_community.utilities import SQLDatabase
from langchain_community.agent_toolkits import SQLDatabaseToolkit
from langgraph.prebuilt import create_react_agent
from langchain_groq import ChatGroq
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from prompt import GetPrompt

# Load environment variables
load_dotenv()


def load_model():
    """Load the Groq LLM."""
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        print("ERROR: GROQ_API_KEY not set in environment.")
        return None
    model = ChatGroq(
        model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
        api_key=key,
        timeout=60,
        max_retries=3,
    )
    return model


def load_database():
    """Connect to the PostgreSQL database via DATABASE_URL."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL not set in environment.")
        return None
    try:
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        parsed = make_url(url)
        # Prisma-only query options are not accepted by psycopg2.
        parsed = parsed.difference_update_query(["schema", "pgbouncer", "connection_limit", "pool_timeout"])
        engine = create_engine(parsed, pool_pre_ping=True, pool_size=2, max_overflow=1,
            connect_args={"connect_timeout": 10})

        @event.listens_for(engine, "begin")
        def set_transaction_options(connection):
            # Apply per transaction: connection initialization rolls back SETs,
            # and transaction poolers can hand us another server connection.
            connection.exec_driver_sql("SET TRANSACTION READ ONLY")
            connection.exec_driver_sql("SET LOCAL statement_timeout = '15s'")

        tables = [name.strip() for name in os.getenv("SQL_AGENT_TABLES", "Ward,Route,Issue,IssueAnalysis,IssueAssignment,IssueResolution,RouteAssignment,SurveySession").split(",") if name.strip()]
        db = SQLDatabase(engine, include_tables=tables, sample_rows_in_table_info=0)
        print(f"Database connected. Dialect: {db.dialect}")
        print(f"Available tables: {db.get_usable_table_names()}")
        return db
    except Exception as e:
        print(f"Failed to initialize database: {e}")
        return None


def create_agent(model, database):
    """Create a LangGraph ReAct SQL agent."""
    toolkit = SQLDatabaseToolkit(db=database, llm=model)
    tools = toolkit.get_tools()
    system_prompt = GetPrompt(database)
    agent = create_react_agent(model, tools, prompt=system_prompt)
    return agent


def ask_question(question: str, agent) -> str:
    """Send a question to the agent and return the final text answer."""
    result = None
    for step in agent.stream(
        {"messages": [{"role": "user", "content": question}]},
        stream_mode="values",
        config={"recursion_limit": 20},
    ):
        result = step["messages"][-1]

    if result is None:
        return "No response from agent."

    # AIMessage has a .content attribute; plain strings are returned as-is
    return result.content if hasattr(result, "content") else str(result)


# ── Module-level singletons (loaded once when imported by interface.py) ──────
_model = None
_database = None
_agent = None


def get_agent():
    """Return a cached agent, initializing on first call."""
    global _model, _database, _agent
    if _agent is None:
        _model = load_model()
        if not _model:
            return None
        _database = load_database()
        if not _database:
            return None
        _agent = create_agent(_model, _database)
    return _agent


if __name__ == "__main__":
    agent = get_agent()
    if agent:
        answer = ask_question("What is the current progress and condition of our city?", agent)
        print(answer)
